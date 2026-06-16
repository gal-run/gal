import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

interface TerminalGalServerConfig {
  projectPath?: string;
}

interface PtyProcessLike {
  pid: number;
  write(data: string): void;
  kill(): void;
  resize(cols: number, rows: number): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (event: { exitCode: number }) => void): void;
}

class SpawnBasedProcess implements PtyProcessLike {
  pid: number;
  private child: ReturnType<typeof spawn>;
  private exitCallbacks: Array<(event: { exitCode: number }) => void> = [];
  private _exitCode: number | null = null;
  private dataCallbacks: Array<(data: string) => void> = [];

  constructor(child: ReturnType<typeof spawn>) {
    this.child = child;
    this.pid = child.pid ?? 0;

    child.stdout?.on("data", (chunk) => {
      for (const cb of this.dataCallbacks) cb(String(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      for (const cb of this.dataCallbacks) cb(String(chunk));
    });
    child.on("close", (code) => {
      this._exitCode = code ?? 0;
      for (const cb of this.exitCallbacks) cb({ exitCode: this._exitCode });
    });
    child.on("error", (_err) => {
      this._exitCode = 1;
      for (const cb of this.exitCallbacks) cb({ exitCode: 1 });
    });
  }

  write(data: string): void {
    this.child.stdin?.write(data);
  }

  kill(): void {
    this.child.kill();
  }

  resize(_cols: number, _rows: number): void {
    // Spawn-based processes don't support resize
  }

  onData(callback: (data: string) => void): void {
    this.dataCallbacks.push(callback);
  }

  onExit(callback: (event: { exitCode: number }) => void): void {
    this.exitCallbacks.push(callback);
    if (this._exitCode !== null) {
      callback({ exitCode: this._exitCode });
    }
  }
}

interface TerminalSession {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  pty: PtyProcessLike;
  output: string;
  closed: boolean;
  exitCode: number | null;
  transport: "pty" | "spawn";
}

const TERMINAL_GAL_TOOLS = [
  {
    name: "gal-terminal-use_terminal_create_session",
    description:
      "Create a node-pty backed terminal session for interactive CLI automation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Executable to launch" },
        args: {
          type: "array",
          description: "Command arguments",
          items: { type: "string" },
        },
        cwd: {
          type: "string",
          description: "Working directory (default: project path)",
        },
        env: {
          type: "object",
          description: "Extra environment variables",
          additionalProperties: { type: "string" },
        },
        cols: {
          type: "number",
          description: "Terminal width in columns (default: 120)",
        },
        rows: {
          type: "number",
          description: "Terminal height in rows (default: 40)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "gal-terminal-use_terminal_exec",
    description:
      "Run a one-shot command in a PTY and wait for it to exit or time out.",
    inputSchema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Executable to launch" },
        args: {
          type: "array",
          description: "Command arguments",
          items: { type: "string" },
        },
        cwd: {
          type: "string",
          description: "Working directory (default: project path)",
        },
        env: {
          type: "object",
          description: "Extra environment variables",
          additionalProperties: { type: "string" },
        },
        timeout_ms: {
          type: "number",
          description:
            "Maximum wait time before the session is killed (default: 15000)",
        },
        cols: {
          type: "number",
          description: "Terminal width in columns (default: 120)",
        },
        rows: {
          type: "number",
          description: "Terminal height in rows (default: 40)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "gal-terminal-use_terminal_write",
    description: "Write text into an existing terminal session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Terminal session id" },
        text: { type: "string", description: "Text to send to the PTY" },
      },
      required: ["session_id", "text"],
    },
  },
  {
    name: "gal-terminal-use_terminal_read",
    description: "Read buffered output from a terminal session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Terminal session id" },
        last_chars: {
          type: "number",
          description:
            "Return only the final N characters instead of the full buffer",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "gal-terminal-use_terminal_wait_for",
    description: "Wait until terminal output contains a substring.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Terminal session id" },
        text: { type: "string", description: "Substring to wait for" },
        timeout_ms: {
          type: "number",
          description: "Maximum wait time in milliseconds (default: 10000)",
        },
      },
      required: ["session_id", "text"],
    },
  },
  {
    name: "gal-terminal-use_terminal_resize",
    description: "Resize an existing terminal session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Terminal session id" },
        cols: { type: "number", description: "Terminal width in columns" },
        rows: { type: "number", description: "Terminal height in rows" },
      },
      required: ["session_id", "cols", "rows"],
    },
  },
  {
    name: "gal-terminal-use_terminal_list_sessions",
    description: "List active terminal sessions tracked by the server.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "gal-terminal-use_terminal_close_session",
    description: "Close a terminal session and release the PTY.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Terminal session id" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "gal-terminal-use_terminal_screenshot",
    description:
      "Take a screenshot of the terminal or screen. Returns base64-encoded PNG image.",
    inputSchema: {
      type: "object" as const,
      properties: {
        window: {
          type: "string",
          description:
            'Window to capture: "screen" (default), "window" (frontmost window), or "selection" (interactive selection)',
        },
        output_path: {
          type: "string",
          description:
            "Optional path to save screenshot. If not provided, returns base64.",
        },
      },
      required: [],
    },
  },
  {
    name: "gal-terminal-use_terminal_render",
    description:
      "Render terminal session output as an image with ANSI colors preserved.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: {
          type: "string",
          description: "Terminal session id to render",
        },
        cols: {
          type: "number",
          description: "Terminal width in columns (default: 120)",
        },
        rows: {
          type: "number",
          description: "Terminal height in rows (default: 40)",
        },
      },
      required: ["session_id"],
    },
  },
] as const;

function toJsonContent(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload),
      },
    ],
  };
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(
      ([key, entryValue]) => [key, String(entryValue)],
    ),
  );
}

async function loadNodePty(): Promise<{
  spawn: (
    command: string,
    args: string[],
    options: {
      name: string;
      cols: number;
      rows: number;
      cwd: string;
      env: Record<string, string>;
    },
  ) => PtyProcessLike;
}> {
  try {
    const nodePty = await import("node-pty");
    return nodePty as unknown as {
      spawn: (
        command: string,
        args: string[],
        options: {
          name: string;
          cols: number;
          rows: number;
          cwd: string;
          env: Record<string, string>;
        },
      ) => PtyProcessLike;
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const installCmd =
      process.platform === "darwin"
        ? "brew install python && npm install -g node-pty"
        : process.platform === "linux"
          ? "sudo apt install -y python3 build-essential && npm install -g node-pty"
          : "npm install -g node-pty";
    throw new Error(
      `node-pty is required for interactive terminal sessions.\n` +
        `Error: ${errMsg}\n\n` +
        `Install with:\n  ${installCmd}\n\n` +
        `Note: terminal_exec will fall back to non-PTY mode automatically.`,
    );
  }
}

interface OneShotExecOptions {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}

async function runOneShotProcess(options: OneShotExecOptions): Promise<{
  output: string;
  exitCode: number;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "pipe",
    });

    let output = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(
          new Error(
            `terminal_exec(${options.command}) timed out after ${options.timeoutMs}ms`,
          ),
        );
        return;
      }

      resolve({
        output,
        exitCode: code ?? 0,
      });
    });
  });
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number,
  description: string,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`${description} timed out after ${timeoutMs}ms`);
}

export function createTerminalGalServer(
  config: TerminalGalServerConfig = {},
): Server {
  const projectPath = config.projectPath ?? process.cwd();
  const sessions = new Map<string, TerminalSession>();

  async function createSession(
    args: Record<string, unknown>,
  ): Promise<TerminalSession> {
    const command = typeof args.command === "string" ? args.command : "";
    if (!command) {
      throw new Error("command is required");
    }

    const sessionId = randomUUID();
    const commandArgs = Array.isArray(args.args)
      ? args.args.map((value) => String(value))
      : [];
    const cwd =
      typeof args.cwd === "string" && args.cwd.length > 0
        ? args.cwd
        : projectPath;
    const cols = typeof args.cols === "number" ? args.cols : 120;
    const rows = typeof args.rows === "number" ? args.rows : 40;
    const env = {
      ...(process.env as Record<string, string>),
      ...normalizeStringRecord(args.env),
      TERM: "xterm-256color",
    };

    let proc: PtyProcessLike;
    let transport: "pty" | "spawn" = "pty";

    try {
      const pty = await loadNodePty();
      proc = pty.spawn(command, commandArgs, {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("node-pty is required") ||
        message.includes("posix_spawnp failed")
      ) {
        // Fall back to spawn-based process
        const child = spawn(command, commandArgs, {
          cwd,
          env,
          stdio: ["pipe", "pipe", "pipe"],
        });
        proc = new SpawnBasedProcess(child);
        transport = "spawn";
      } else {
        throw error;
      }
    }

    const session: TerminalSession = {
      id: sessionId,
      command,
      args: commandArgs,
      cwd,
      pty: proc,
      output: "",
      closed: false,
      exitCode: null,
      transport,
    };

    proc.onData((data) => {
      session.output += data;
    });
    proc.onExit((event) => {
      session.closed = true;
      session.exitCode = event.exitCode;
    });

    sessions.set(sessionId, session);
    return session;
  }

  function getSession(sessionId: unknown): TerminalSession {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new Error("session_id is required");
    }

    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown terminal session: ${sessionId}`);
    }

    return session;
  }

  function destroySession(session: TerminalSession): void {
    try {
      session.pty.kill();
    } catch {
      // Best-effort cleanup.
    }
    session.closed = true;
    sessions.delete(session.id);
  }

  const server = new Server(
    {
      name: "terminal-gal",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...TERMINAL_GAL_TOOLS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const safeArgs = (request.params.arguments ?? {}) as Record<
      string,
      unknown
    >;

    try {
      switch (request.params.name) {
        case "gal-terminal-use_terminal_create_session": {
          const session = await createSession(safeArgs);
          return toJsonContent({
            session_id: session.id,
            pid: session.pty.pid,
            cwd: session.cwd,
            command: session.command,
            args: session.args,
          });
        }

        case "gal-terminal-use_terminal_exec": {
          const timeoutMs =
            typeof safeArgs.timeout_ms === "number"
              ? safeArgs.timeout_ms
              : 15_000;
          const command =
            typeof safeArgs.command === "string" ? safeArgs.command : "";
          const commandArgs = Array.isArray(safeArgs.args)
            ? safeArgs.args.map((value) => String(value))
            : [];
          const cwd =
            typeof safeArgs.cwd === "string" && safeArgs.cwd.length > 0
              ? safeArgs.cwd
              : projectPath;
          const env = {
            ...(process.env as Record<string, string>),
            ...normalizeStringRecord(safeArgs.env),
            TERM: "xterm-256color",
          };

          try {
            const session = await createSession(safeArgs);

            try {
              await waitForCondition(
                () => session.closed,
                timeoutMs,
                `terminal_exec(${session.command})`,
              );
              return toJsonContent({
                output: session.output,
                exit_code: session.exitCode ?? 0,
                transport: "pty",
              });
            } finally {
              destroySession(session);
            }
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            const shouldFallback =
              message.includes("node-pty is required") ||
              message.includes("posix_spawnp failed");

            if (!shouldFallback) {
              throw error;
            }

            const result = await runOneShotProcess({
              command,
              args: commandArgs,
              cwd,
              env,
              timeoutMs,
            });

            return toJsonContent({
              output: result.output,
              exit_code: result.exitCode,
              transport: "spawn",
              fallback_reason: message,
            });
          }
        }

        case "gal-terminal-use_terminal_write": {
          const session = getSession(safeArgs.session_id);
          const text = typeof safeArgs.text === "string" ? safeArgs.text : "";
          if (!text) {
            throw new Error("text is required");
          }
          session.pty.write(text);
          return toJsonContent({ success: true, session_id: session.id });
        }

        case "gal-terminal-use_terminal_read": {
          const session = getSession(safeArgs.session_id);
          const output =
            typeof safeArgs.last_chars === "number"
              ? session.output.slice(-safeArgs.last_chars)
              : session.output;
          return toJsonContent({
            session_id: session.id,
            output,
            closed: session.closed,
            exit_code: session.exitCode,
          });
        }

        case "gal-terminal-use_terminal_wait_for": {
          const session = getSession(safeArgs.session_id);
          const text = typeof safeArgs.text === "string" ? safeArgs.text : "";
          if (!text) {
            throw new Error("text is required");
          }
          const timeoutMs =
            typeof safeArgs.timeout_ms === "number"
              ? safeArgs.timeout_ms
              : 10_000;
          await waitForCondition(
            () => session.output.includes(text) || session.closed,
            timeoutMs,
            `terminal_wait_for(${text})`,
          );

          if (!session.output.includes(text)) {
            throw new Error(
              `Session exited before output contained ${JSON.stringify(text)}`,
            );
          }

          return toJsonContent({
            session_id: session.id,
            matched: true,
            output: session.output,
          });
        }

        case "gal-terminal-use_terminal_resize": {
          const session = getSession(safeArgs.session_id);
          const cols = typeof safeArgs.cols === "number" ? safeArgs.cols : 120;
          const rows = typeof safeArgs.rows === "number" ? safeArgs.rows : 40;
          session.pty.resize(cols, rows);
          return toJsonContent({
            success: true,
            session_id: session.id,
            cols,
            rows,
          });
        }

        case "gal-terminal-use_terminal_list_sessions": {
          return toJsonContent({
            sessions: [...sessions.values()].map((session) => ({
              session_id: session.id,
              command: session.command,
              args: session.args,
              cwd: session.cwd,
              closed: session.closed,
              exit_code: session.exitCode,
            })),
          });
        }

        case "gal-terminal-use_terminal_close_session": {
          const session = getSession(safeArgs.session_id);
          destroySession(session);
          return toJsonContent({ success: true, session_id: session.id });
        }

        case "gal-terminal-use_terminal_screenshot": {
          const window =
            typeof safeArgs.window === "string" ? safeArgs.window : "screen";
          const outputPath =
            typeof safeArgs.output_path === "string"
              ? safeArgs.output_path
              : undefined;

          const tmp = await import("os");
          const tmpPath =
            outputPath || `${tmp.tmpdir()}/gal-screenshot-${Date.now()}.png`;

          let captureCmd: string;
          let captureArgs: string[];

          if (process.platform === "darwin") {
            // macOS screencapture
            const flags =
              window === "window"
                ? ["-l", "0"]
                : window === "selection"
                  ? ["-i"]
                  : ["-x"];
            captureCmd = "screencapture";
            captureArgs = [...flags, tmpPath];
          } else if (process.platform === "linux") {
            // Linux - try gnome-screenshot or scrot
            captureCmd = "gnome-screenshot";
            captureArgs =
              window === "window" ? ["-w", "-f", tmpPath] : ["-f", tmpPath];
          } else {
            throw new Error(`Screenshot not supported on ${process.platform}`);
          }

          try {
            const { execFileSync: exec } = await import("child_process");
            exec(captureCmd, captureArgs, { timeout: 10000 });

            if (outputPath) {
              return toJsonContent({ success: true, path: outputPath });
            }

            // Return base64
            const fs = await import("fs");
            const imgBuffer = fs.readFileSync(tmpPath);
            const base64 = imgBuffer.toString("base64");
            fs.unlinkSync(tmpPath);

            return {
              content: [
                {
                  type: "image",
                  data: base64,
                  mimeType: "image/png",
                },
              ],
            };
          } catch (e) {
            throw new Error(
              `Screenshot failed: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        case "gal-terminal-use_terminal_render": {
          const session = getSession(safeArgs.session_id);
          const cols = typeof safeArgs.cols === "number" ? safeArgs.cols : 120;
          const rows = typeof safeArgs.rows === "number" ? safeArgs.rows : 40;

          // Return the raw output with ANSI codes - client can render it
          // For a proper solution, we'd use a library like terminal-render or ansi-to-html
          const output = session.output.slice(-(cols * rows));

          return toJsonContent({
            session_id: session.id,
            cols,
            rows,
            output,
            note: "Output contains ANSI escape codes. Use an ANSI renderer to display.",
          });
        }

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error: unknown) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  });

  process.once("exit", () => {
    for (const session of sessions.values()) {
      destroySession(session);
    }
  });

  return server;
}

export async function startTerminalGalServer(
  config: TerminalGalServerConfig = {},
): Promise<void> {
  process.stderr.write("[gal-terminal-use-mcp] Starting MCP server v0.1.0\n");
  const server = createTerminalGalServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    "[gal-terminal-use-mcp] MCP server connected and ready\n",
  );
}
