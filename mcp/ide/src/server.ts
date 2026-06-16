import { execFile, execFileSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ElectronApplication, Page } from "playwright";

interface VscodeGalServerConfig {
  projectPath?: string;
}

interface VscodeSession {
  electronApp: ElectronApplication;
  window: Page;
  workspacePath: string | null;
  userDataDir: string;
  extensionsDir: string;
  executablePath: string;
}

const VSCODE_GAL_TOOLS = [
  {
    name: "gal-ide-use_install_extension",
    description:
      "Install a VS Code extension via the Code CLI before launching the workbench.",
    inputSchema: {
      type: "object" as const,
      properties: {
        vsix_path: {
          type: "string",
          description: "Absolute path to a .vsix file",
        },
        extension_id: {
          type: "string",
          description: "Marketplace extension id",
        },
        cli_path: { type: "string", description: "Override the Code CLI path" },
        user_data_dir: { type: "string", description: "VS Code user-data dir" },
        extensions_dir: {
          type: "string",
          description: "VS Code extensions dir",
        },
      },
    },
  },
  {
    name: "gal-ide-use_launch",
    description:
      "Launch VS Code through Electron automation and keep the session open.",
    inputSchema: {
      type: "object" as const,
      properties: {
        workspace_path: {
          type: "string",
          description: "Workspace folder to open",
        },
        executable_path: {
          type: "string",
          description: "Override the VS Code executable path",
        },
        user_data_dir: { type: "string", description: "VS Code user-data dir" },
        extensions_dir: {
          type: "string",
          description: "VS Code extensions dir",
        },
      },
    },
  },
  {
    name: "gal-ide-use_run_command",
    description: "Open the command palette and execute a command by label.",
    inputSchema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "Command palette label to execute",
        },
        wait_ms: {
          type: "number",
          description: "Extra wait after execution (default: 1000)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "gal-ide-use_click_text",
    description: "Click visible workbench text in the active VS Code window.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Visible text to click" },
        exact: { type: "boolean", description: "Require an exact text match" },
      },
      required: ["text"],
    },
  },
  {
    name: "gal-ide-use_get_text",
    description:
      "Read visible text from the VS Code window or a scoped selector.",
    inputSchema: {
      type: "object" as const,
      properties: {
        selector: { type: "string", description: "Optional CSS selector" },
      },
    },
  },
  {
    name: "gal-ide-use_get_gal_status",
    description: "Return any status bar text that mentions GAL.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "gal-ide-use_screenshot",
    description: "Capture the active VS Code window as a PNG screenshot.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "gal-ide-use_close",
    description: "Close the active VS Code automation session.",
    inputSchema: {
      type: "object" as const,
      properties: {},
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

function execFileAsync(
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `Command failed: ${file} ${args.join(" ")}\n${stderr || error.message}`,
          ),
        );
        return;
      }
      resolvePromise({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
      });
    });
  });
}

async function waitForTimeout(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForTimeout(timeoutMs);
}

function resolveOnPath(binaryName: string): string | null {
  const locator = process.platform === "win32" ? "where" : "which";

  try {
    const output = execFileSync(locator, [binaryName], {
      encoding: "utf8",
    }).trim();
    return output.length > 0 ? output.split(/\r?\n/)[0] : null;
  } catch {
    return null;
  }
}

function findVsCodeBundlePath(): string | null {
  if (process.platform !== "darwin") {
    return null;
  }

  for (const bundleId of [
    "com.microsoft.VSCode",
    "com.microsoft.VSCodeInsiders",
  ]) {
    try {
      const output = execFileSync(
        "mdfind",
        [`kMDItemCFBundleIdentifier == '${bundleId}'`],
        { encoding: "utf8" },
      ).trim();
      const firstPath = output
        .split(/\r?\n/)
        .find((value) => value.endsWith(".app"));
      if (firstPath) {
        return firstPath;
      }
    } catch {
      // Best-effort fallback.
    }
  }

  return null;
}

function resolveVsCodeExecutable(explicitPath?: string): string {
  const detectedBundlePath = findVsCodeBundlePath();
  const candidates = [
    explicitPath,
    process.env.GAL_VSCODE_EXECUTABLE,
    process.env.VSCODE_EXECUTABLE_PATH,
    detectedBundlePath
      ? join(detectedBundlePath, "Contents", "MacOS", "Electron")
      : null,
    process.platform === "darwin"
      ? "/Applications/Visual Studio Code.app/Contents/MacOS/Electron"
      : null,
    process.platform === "darwin"
      ? "/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron"
      : null,
    resolveOnPath("code"),
  ].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  const executablePath = candidates.find(
    (value) => existsSync(value) || !value.startsWith("/"),
  );
  if (!executablePath) {
    throw new Error(
      "Could not resolve a VS Code executable. Set GAL_VSCODE_EXECUTABLE or pass executable_path.",
    );
  }

  return executablePath;
}

function resolveVsCodeCli(explicitPath?: string): string {
  const detectedBundlePath = findVsCodeBundlePath();
  const candidates = [
    explicitPath,
    process.env.GAL_VSCODE_CLI_PATH,
    detectedBundlePath
      ? join(detectedBundlePath, "Contents", "Resources", "app", "bin", "code")
      : null,
    process.platform === "darwin"
      ? "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
      : null,
    process.platform === "darwin"
      ? "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders"
      : null,
    resolveOnPath("code"),
    resolveOnPath("code-insiders"),
  ].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  const cliPath = candidates.find(
    (value) => existsSync(value) || !value.startsWith("/"),
  );
  if (!cliPath) {
    throw new Error(
      "Could not resolve the VS Code CLI. Set GAL_VSCODE_CLI_PATH or pass cli_path.",
    );
  }

  return cliPath;
}

async function loadElectron() {
  const playwright = await import("playwright");
  return playwright._electron;
}

async function openCommandPalette(window: Page): Promise<void> {
  await window.bringToFront();
  await window.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+P" : "Control+Shift+P",
  );
  const locator = window
    .locator('input[aria-label*="Type the name of a command"]')
    .last();
  await locator.waitFor({ state: "visible", timeout: 10_000 });
}

export function createVscodeGalServer(
  config: VscodeGalServerConfig = {},
): Server {
  const projectPath = config.projectPath ?? process.cwd();
  let session: VscodeSession | null = null;

  async function getSession(): Promise<VscodeSession> {
    if (!session) {
      throw new Error(
        "No active VS Code session. Call gal-ide-use_launch first.",
      );
    }
    return session;
  }

  async function closeSession(): Promise<void> {
    if (!session) {
      return;
    }

    try {
      await session.electronApp.close();
    } finally {
      session = null;
    }
  }

  const server = new Server(
    {
      name: "gal-ide-use-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...VSCODE_GAL_TOOLS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const safeArgs = (request.params.arguments ?? {}) as Record<
      string,
      unknown
    >;

    try {
      switch (request.params.name) {
        case "gal-ide-use_install_extension": {
          const target =
            typeof safeArgs.vsix_path === "string" &&
            safeArgs.vsix_path.length > 0
              ? safeArgs.vsix_path
              : typeof safeArgs.extension_id === "string" &&
                  safeArgs.extension_id.length > 0
                ? safeArgs.extension_id
                : null;

          if (!target) {
            throw new Error("Provide either vsix_path or extension_id.");
          }

          const cliPath = resolveVsCodeCli(
            typeof safeArgs.cli_path === "string"
              ? safeArgs.cli_path
              : undefined,
          );
          const userDataDir =
            typeof safeArgs.user_data_dir === "string"
              ? resolve(safeArgs.user_data_dir)
              : join(tmpdir(), "gal-ide-use-gal-user-data");
          const extensionsDir =
            typeof safeArgs.extensions_dir === "string"
              ? resolve(safeArgs.extensions_dir)
              : join(userDataDir, "extensions");
          mkdirSync(userDataDir, { recursive: true });
          mkdirSync(extensionsDir, { recursive: true });

          const result = await execFileAsync(cliPath, [
            `--user-data-dir=${userDataDir}`,
            `--extensions-dir=${extensionsDir}`,
            "--install-extension",
            target,
            "--force",
          ]);

          return toJsonContent({
            success: true,
            target,
            user_data_dir: userDataDir,
            extensions_dir: extensionsDir,
            stdout: result.stdout,
            stderr: result.stderr,
          });
        }

        case "gal-ide-use_launch": {
          await closeSession();

          const executablePath = resolveVsCodeExecutable(
            typeof safeArgs.executable_path === "string"
              ? safeArgs.executable_path
              : undefined,
          );
          const workspacePath =
            typeof safeArgs.workspace_path === "string" &&
            safeArgs.workspace_path.length > 0
              ? resolve(safeArgs.workspace_path)
              : projectPath;
          const userDataDir =
            typeof safeArgs.user_data_dir === "string"
              ? resolve(safeArgs.user_data_dir)
              : join(tmpdir(), `gal-ide-use-gal-${Date.now()}`);
          const extensionsDir =
            typeof safeArgs.extensions_dir === "string"
              ? resolve(safeArgs.extensions_dir)
              : join(userDataDir, "extensions");

          mkdirSync(userDataDir, { recursive: true });
          mkdirSync(extensionsDir, { recursive: true });

          const electron = await loadElectron();
          const args = [
            `--user-data-dir=${userDataDir}`,
            `--extensions-dir=${extensionsDir}`,
            "--disable-workspace-trust",
            "--skip-release-notes",
            "--skip-welcome",
            "--disable-updates",
            workspacePath,
          ];
          const electronApp = await electron.launch({
            executablePath,
            args,
          });
          const window = await electronApp.firstWindow();
          await window.waitForLoadState("domcontentloaded");
          await waitForTimeout(window, 2_000);

          session = {
            electronApp,
            window,
            workspacePath,
            userDataDir,
            extensionsDir,
            executablePath,
          };

          return toJsonContent({
            success: true,
            executable_path: executablePath,
            workspace_path: workspacePath,
            user_data_dir: userDataDir,
            extensions_dir: extensionsDir,
          });
        }

        case "gal-ide-use_run_command": {
          const activeSession = await getSession();
          const command =
            typeof safeArgs.command === "string" ? safeArgs.command : "";
          if (!command) {
            throw new Error("command is required");
          }

          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              await openCommandPalette(activeSession.window);
              const locator = activeSession.window
                .locator('input[aria-label*="Type the name of a command"]')
                .last();
              await locator.click();
              await activeSession.window.keyboard.press(
                process.platform === "darwin" ? "Meta+A" : "Control+A",
              );
              await activeSession.window.keyboard.press("Backspace");
              await activeSession.window.keyboard.type(command, { delay: 25 });
              await activeSession.window
                .getByText(command, { exact: true })
                .first()
                .waitFor({ state: "visible", timeout: 10_000 });
              await activeSession.window
                .getByText(command, { exact: true })
                .first()
                .click();
              lastError = null;
              break;
            } catch (error: unknown) {
              lastError = error;
              await activeSession.window.keyboard.press("Escape");
              await waitForTimeout(activeSession.window, 5_000);
            }
          }

          if (lastError) {
            throw lastError;
          }

          await waitForTimeout(
            activeSession.window,
            typeof safeArgs.wait_ms === "number" ? safeArgs.wait_ms : 1_000,
          );

          return toJsonContent({ success: true, command });
        }

        case "gal-ide-use_click_text": {
          const activeSession = await getSession();
          const text = typeof safeArgs.text === "string" ? safeArgs.text : "";
          if (!text) {
            throw new Error("text is required");
          }

          await activeSession.window
            .getByText(text, { exact: safeArgs.exact === true })
            .first()
            .click();

          return toJsonContent({ success: true, text });
        }

        case "gal-ide-use_get_text": {
          const activeSession = await getSession();
          const text =
            typeof safeArgs.selector === "string" &&
            safeArgs.selector.length > 0
              ? await activeSession.window
                  .locator(safeArgs.selector)
                  .first()
                  .innerText()
              : await activeSession.window.locator("body").innerText();

          return {
            content: [
              {
                type: "text",
                text,
              },
            ],
          };
        }

        case "gal-ide-use_get_gal_status": {
          const activeSession = await getSession();
          const statusSnapshot = await activeSession.window.evaluate(() => {
            const selectors = [
              ".statusbar-item",
              ".part.statusbar .statusbar-item",
              ".part.statusbar [aria-label]",
              ".part.statusbar [title]",
              '[aria-label*="GAL"]',
              '[title*="GAL"]',
            ];
            const values = new Set<string>();

            for (const selector of selectors) {
              for (const node of document.querySelectorAll(selector)) {
                const element = node as HTMLElement;
                const candidates = [
                  element.textContent,
                  element.getAttribute("aria-label"),
                  element.getAttribute("title"),
                ];
                for (const candidate of candidates) {
                  const normalized =
                    candidate?.replace(/\s+/g, " ").trim() ?? "";
                  if (normalized.length > 0) {
                    values.add(normalized);
                  }
                }
              }
            }

            return {
              statusItems: Array.from(values),
              bodyText: document.body.innerText
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 2000),
            };
          });
          const galStatusItems = statusSnapshot.statusItems.filter((item) =>
            item.toLowerCase().includes("gal"),
          );

          return toJsonContent({
            status_items: galStatusItems,
            status_items_all: statusSnapshot.statusItems,
            body_text: statusSnapshot.bodyText,
          });
        }

        case "gal-ide-use_screenshot": {
          const activeSession = await getSession();
          const buffer = await activeSession.window.screenshot({ type: "png" });
          return {
            content: [
              {
                type: "image",
                data: buffer.toString("base64"),
                mimeType: "image/png",
              },
            ],
          };
        }

        case "gal-ide-use_close": {
          await closeSession();
          return toJsonContent({ success: true });
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
    if (session) {
      void session.electronApp.close().catch(() => undefined);
      session = null;
    }
  });

  return server;
}

export async function startVscodeGalServer(
  config: VscodeGalServerConfig = {},
): Promise<void> {
  process.stderr.write("[gal-ide-use-mcp] Starting MCP server v0.1.0\n");
  const server = createVscodeGalServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[gal-ide-use-mcp] MCP server connected and ready\n");
}
