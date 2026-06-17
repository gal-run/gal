// UI-TARS vision-agent path for gal-computer-use.
//
// The UI-TARS extras (`@ui-tars/sdk`, `@ui-tars/operator-nut-js`,
// `@ui-tars/operator-browser`) are OPTIONAL native deps. This module is written
// so it LOADS and TYPE-CHECKS without them installed: there are no top-level
// `@ui-tars/*` imports and no top-level subclassing. The native code is only
// pulled in (via dynamic `import()`) when the UI-TARS path is actually invoked.
// If an extra is missing at runtime, a clear install hint is thrown.

const log = (msg: string) =>
  process.stderr.write(`[gal-computer-use:uitars] ${msg}\n`);

// Local type shim — mirrors @ui-tars/sdk/core ScreenshotOutput so we don't
// statically depend on the optional package's types.
export interface ScreenshotOutput {
  base64: string;
  scaleFactor: number;
}

// Minimal surface of the UI-TARS GUIAgent we drive. Kept `any`-backed at the
// dynamic-import boundary so tsc compiles without the optional deps present.
interface GUIAgentLike {
  run(instruction: string): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
}

const EXTRAS_HINT =
  "UI-TARS extras not installed — `npm i @ui-tars/sdk @ui-tars/operator-nut-js`";

export async function compressScreenshot(
  raw: ScreenshotOutput,
): Promise<ScreenshotOutput> {
  try {
    const { Jimp } = await import("jimp");
    const buf = Buffer.from(raw.base64, "base64");
    const img = await Jimp.read(buf);
    const w = img.width;
    const h = img.height;
    const maxDim = 1024;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      img.resize({ w: Math.round(w * ratio), h: Math.round(h * ratio) });
    }
    const compressed = await img.getBuffer("image/jpeg", { quality: 70 });
    const b64 = compressed.toString("base64");
    log(
      `Screenshot: ${w}x${h} → ${img.width}x${img.height} (${(raw.base64.length / 1024).toFixed(0)}KB → ${(b64.length / 1024).toFixed(0)}KB)`,
    );
    return { base64: b64, scaleFactor: raw.scaleFactor };
  } catch {
    return raw;
  }
}

export function resolveVlmConfig(): {
  baseURL: string;
  apiKey: string;
  model: string;
} {
  if (process.env.UITARS_VLM_MODEL || process.env.UITARS_VLM_BASE_URL) {
    const baseURL =
      process.env.UITARS_VLM_BASE_URL || "https://openrouter.ai/api/v1";
    const apiKey =
      process.env.UITARS_VLM_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.TOKENMIX_API_KEY ||
      process.env.GEMINI_API_KEY ||
      "";
    const model = process.env.UITARS_VLM_MODEL || "bytedance/ui-tars-1.5-7b";
    if (
      !apiKey &&
      !baseURL.includes("localhost") &&
      !baseURL.includes("127.0.0.1")
    ) {
      throw new Error("No VLM API key.");
    }
    return { baseURL, apiKey, model };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: "bytedance/ui-tars-1.5-7b",
    };
  }
  if (process.env.TOKENMIX_API_KEY) {
    return {
      baseURL: "https://api.tokenmix.ai/v1",
      apiKey: process.env.TOKENMIX_API_KEY,
      model: "doubao-1.5-vision-pro",
    };
  }
  if (process.env.MLX_UI_TARS_URL || process.env.NO_API_KEY === "mlx") {
    return {
      baseURL: process.env.MLX_UI_TARS_URL || "http://localhost:11435/v1",
      apiKey: "mlx",
      model:
        process.env.UITARS_VLM_MODEL || "mlx-community/UI-TARS-1.5-7B-4bit",
    };
  }
  const baseURL =
    process.env.VLM_GATEWAY_URL ||
    "https://generativelanguage.googleapis.com/v1beta/openai";
  const apiKey =
    process.env.VLM_GATEWAY_KEY || process.env.GEMINI_API_KEY || "";
  const model = "gemini-2.5-flash";
  if (!apiKey) {
    throw new Error(
      "No VLM API key. Set TOKENMIX_API_KEY, OPENROUTER_API_KEY, VLM_GATEWAY_KEY, or GEMINI_API_KEY.",
    );
  }
  return { baseURL, apiKey, model };
}

export interface UITarsResult {
  status: string;
  summary: string;
  steps: string[];
  error?: string;
}

let currentAgent: GUIAgentLike | null = null;

export function pauseGUIAgent(): string {
  if (!currentAgent) return "No active GUI agent";
  currentAgent.pause();
  return "Agent paused";
}

export function resumeGUIAgent(): string {
  if (!currentAgent) return "No active GUI agent";
  currentAgent.resume();
  return "Agent resumed";
}

export function stopGUIAgent(): string {
  if (!currentAgent) return "No active GUI agent";
  currentAgent.stop();
  currentAgent = null;
  return "Agent stopped";
}

/**
 * Dynamically load the optional UI-TARS extras and build a GUIAgent whose
 * NutJS operator compresses screenshots before they reach the VLM. Only called
 * on the UI-TARS path, so the module stays loadable without the native deps.
 */
async function createUITarsAgent(opts: {
  vlm: { baseURL: string; apiKey: string; model: string };
  maxSteps: number;
  signal?: AbortSignal;
  steps: string[];
}): Promise<GUIAgentLike> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GUIAgent: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let NutJSOperator: any;
  try {
    // Optional native deps — resolved only at runtime (NodeNext leaves the
    // dynamic specifier unresolved at compile time; results land in `any`).
    ({ GUIAgent } = await import("@ui-tars/sdk"));
    ({ NutJSOperator } = await import("@ui-tars/operator-nut-js"));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`${EXTRAS_HINT} (${detail})`);
  }

  // Subclass the native operator here (not at module top-level) so the class
  // declaration doesn't force a static dependency on the optional package.
  class CompressedNutJSOperator extends NutJSOperator {
    async screenshot(): Promise<ScreenshotOutput> {
      const raw = (await super.screenshot()) as ScreenshotOutput;
      return await compressScreenshot(raw);
    }
  }

  const { vlm, maxSteps, signal, steps } = opts;
  const agent: GUIAgentLike = new GUIAgent({
    model: {
      baseURL: vlm.baseURL,
      apiKey: vlm.apiKey,
      model: vlm.model,
      max_tokens: 1024,
    },
    operator: new CompressedNutJSOperator(),
    maxLoopCount: maxSteps,
    signal,
    onData: ({
      data,
    }: {
      data: { conversations?: Array<{ from: string; value?: string }> };
    }) => {
      for (const item of data.conversations ?? []) {
        if (item.from === "gpt" && item.value) {
          const thought = item.value.trim();
          if (thought) {
            steps.push(thought);
            log(`Step ${steps.length}: ${thought.slice(0, 200)}`);
          }
        }
      }
    },
    onError: ({ error }: { error: { message: string } }) => {
      log(`Error: ${error.message}`);
    },
  });
  return agent;
}

export async function executeWithUITars(
  instruction: string,
  options: { maxSteps?: number; signal?: AbortSignal } = {},
): Promise<UITarsResult> {
  const vlm = resolveVlmConfig();
  const steps: string[] = [];

  log(`Starting UI-TARS task: "${instruction}"`);
  log(`VLM: ${vlm.model} @ ${vlm.baseURL}`);

  const agent = await createUITarsAgent({
    vlm,
    maxSteps: options.maxSteps ?? 50,
    signal: options.signal,
    steps,
  });

  currentAgent = agent;

  try {
    await agent.run(instruction);
    log("UI-TARS task completed successfully");
    return {
      status: "completed",
      summary: steps[steps.length - 1] || "Task completed",
      steps,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`UI-TARS task failed: ${msg}`);
    return {
      status: "error",
      summary: msg,
      steps,
      error: msg,
    };
  } finally {
    agent.stop();
    if (currentAgent === agent) currentAgent = null;
  }
}

export async function verifyWithUITars(
  description: string,
): Promise<UITarsResult> {
  const instruction = `Verify the current screen matches this description: "${description}". If it matches, respond with just the word "match". If not, describe what is wrong.`;
  return executeWithUITars(instruction, { maxSteps: 3 });
}
