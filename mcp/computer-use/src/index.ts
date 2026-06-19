#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  screenshot,
  click,
  typeText,
  keyPress,
  rightClick,
  doubleClick,
  getAppState,
  setValue,
  animateMouseMove,
  mouseMove,
  scroll,
  drag,
  listApps,
  activateApp,
  getScreenSize,
  getMousePosition,
  chromeTabs,
  chromeActiveTab,
  chromeHighlightTab,
  chromeClearHighlight,
} from "./tools.js";
import {
  executeWithUITars,
  verifyWithUITars,
  pauseGUIAgent,
  resumeGUIAgent,
  stopGUIAgent,
} from "./uitars.js";

const server = new McpServer({
  name: "gal-computer-use",
  version: "0.1.0",
});

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function err(msg: string, error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${msg}: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true,
  };
}

server.tool(
  "computer_screenshot",
  "Take a screenshot of the entire screen and save to a file.",
  {
    path: z
      .string()
      .optional()
      .describe(
        "Output file path. Default: /tmp/gal-screenshot-<timestamp>.png",
      ),
  },
  async ({ path }) => {
    try {
      return ok(screenshot(path));
    } catch (e) {
      return err("Screenshot failed", e);
    }
  },
);

server.tool(
  "computer_click",
  "Click at the specified screen coordinates.",
  {
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
  },
  async ({ x, y }) => {
    try {
      return ok(click(x, y));
    } catch (e) {
      return err("Click failed", e);
    }
  },
);

server.tool(
  "computer_right_click",
  "Right-click at the specified screen coordinates (context menu).",
  {
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
  },
  async ({ x, y }) => {
    try {
      return ok(rightClick(x, y));
    } catch (e) {
      return err("Right click failed", e);
    }
  },
);

server.tool(
  "computer_double_click",
  "Double-click at the specified screen coordinates.",
  {
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
  },
  async ({ x, y }) => {
    try {
      return ok(doubleClick(x, y));
    } catch (e) {
      return err("Double click failed", e);
    }
  },
);

server.tool(
  "computer_app_state",
  "Get the state of the frontmost application (name, window title, position, size, PID). Optionally specify an app name to query a specific app.",
  {
    app_name: z
      .string()
      .optional()
      .describe("Application name to query (default: frontmost app)"),
  },
  async ({ app_name }) => {
    try {
      const state = getAppState(app_name);
      return ok(JSON.stringify(state));
    } catch (e) {
      return err("App state failed", e);
    }
  },
);

server.tool(
  "computer_set_value",
  "Set the value of the currently focused UI element directly via Accessibility API. Unlike type_text, this sets the value property without simulating keystrokes.",
  {
    value: z.string().describe("Value to set on the focused element"),
    app: z
      .string()
      .optional()
      .describe("Application to target (default: frontmost)"),
  },
  async ({ value, app }) => {
    try {
      return ok(setValue(value, app));
    } catch (e) {
      return err("Set value failed", e);
    }
  },
);

server.tool(
  "computer_chrome_tabs",
  "List all open Chrome browser tabs, including their titles and URLs.",
  {},
  async () => {
    try {
      const tabs = chromeTabs();
      return ok(JSON.stringify(tabs));
    } catch (e) {
      return err("Chrome tabs failed", e);
    }
  },
);

server.tool(
  "computer_chrome_active_tab",
  "Get the currently active Chrome browser tab (title, URL).",
  {},
  async () => {
    try {
      const tab = chromeActiveTab();
      if (!tab) return ok("Chrome not running or no active tab");
      return ok(JSON.stringify(tab));
    } catch (e) {
      return err("Chrome active tab failed", e);
    }
  },
);

server.tool(
  "computer_chrome_highlight",
  "Add a colored overlay (default: orange) to the active Chrome tab to visually indicate automation is in progress. Shows a colored border and a label pill.",
  {
    color: z
      .string()
      .optional()
      .describe("Border and label color (default: orange)"),
    label: z
      .string()
      .optional()
      .describe("Label text shown in the pill (default: 'Automated')"),
  },
  async ({ color, label }) => {
    try {
      return ok(chromeHighlightTab(color, label));
    } catch (e) {
      return err("Chrome highlight failed", e);
    }
  },
);

server.tool(
  "computer_chrome_clear_highlight",
  "Remove the overlay indicator from the active Chrome tab.",
  {},
  async () => {
    try {
      return ok(chromeClearHighlight());
    } catch (e) {
      return err("Clear highlight failed", e);
    }
  },
);

server.tool(
  "computer_move",
  "Move the mouse cursor to the specified coordinates with a smooth animation.",
  {
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
    duration: z
      .number()
      .optional()
      .describe("Animation duration in milliseconds (default: 300)"),
  },
  async ({ x, y, duration }) => {
    try {
      return ok(animateMouseMove(x, y, duration));
    } catch (e) {
      return err("Move failed", e);
    }
  },
);

server.tool(
  "computer_type",
  "Type text at the current keyboard focus.",
  {
    text: z.string().describe("Text to type"),
  },
  async ({ text }) => {
    try {
      return ok(typeText(text));
    } catch (e) {
      return err("Type failed", e);
    }
  },
);

server.tool(
  "computer_key",
  "Press a key by name (return, escape, tab, space, up, down, left, right, f1-f12, etc).",
  {
    key: z.string().describe("Key name to press"),
  },
  async ({ key }) => {
    try {
      return ok(keyPress(key));
    } catch (e) {
      return err("Key press failed", e);
    }
  },
);

server.tool(
  "computer_move_instant",
  "Move the mouse cursor instantly to the specified coordinates (no animation).",
  {
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
  },
  async ({ x, y }) => {
    try {
      return ok(mouseMove(x, y));
    } catch (e) {
      return err("Move failed", e);
    }
  },
);

server.tool(
  "computer_scroll",
  "Scroll the mouse wheel at the current position.",
  {
    amount: z.number().describe("Number of scroll clicks"),
    direction: z
      .enum(["up", "down"])
      .optional()
      .describe("Scroll direction. Default: down"),
  },
  async ({ amount, direction }) => {
    try {
      return ok(scroll(amount, direction));
    } catch (e) {
      return err("Scroll failed", e);
    }
  },
);

server.tool(
  "computer_drag",
  "Drag from one point to another.",
  {
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
  },
  async ({ x1, y1, x2, y2 }) => {
    try {
      return ok(drag(x1, y1, x2, y2));
    } catch (e) {
      return err("Drag failed", e);
    }
  },
);

server.tool("computer_apps", "List all running applications.", {}, async () => {
  try {
    return ok(listApps());
  } catch (e) {
    return err("List apps failed", e);
  }
});

server.tool(
  "computer_activate",
  "Activate (bring to front) an application by name.",
  {
    name: z
      .string()
      .describe("Application name (e.g., 'Safari', 'Google Chrome')"),
  },
  async ({ name }) => {
    try {
      return ok(activateApp(name));
    } catch (e) {
      return err("Activate failed", e);
    }
  },
);

server.tool(
  "computer_screen_size",
  "Get the current screen dimensions.",
  {},
  async () => {
    try {
      const { width, height } = getScreenSize();
      return ok(JSON.stringify({ width, height }));
    } catch (e) {
      return err("Screen size failed", e);
    }
  },
);

server.tool(
  "computer_mouse_position",
  "Get the current mouse cursor position.",
  {},
  async () => {
    try {
      const { x, y } = getMousePosition();
      return ok(JSON.stringify({ x, y }));
    } catch (e) {
      return err("Mouse position failed", e);
    }
  },
);

server.tool(
  "computer_use_execute",
  "Execute a natural language GUI automation task using UI-TARS vision model. Takes screenshots, reasons about the UI, and performs mouse/keyboard actions to complete the task. For manual QA, visual verification, and multi-step desktop automation.",
  {
    task: z
      .string()
      .describe(
        "Natural language description of the task to perform (e.g., 'Open Safari and navigate to example.com, then verify the login page appears')",
      ),
    maxSteps: z
      .number()
      .optional()
      .describe("Maximum number of action steps. Default: 50"),
  },
  async ({ task, maxSteps }) => {
    try {
      const abort = new AbortController();
      const result = await executeWithUITars(task, {
        maxSteps,
        signal: abort.signal,
      });
      return ok(
        JSON.stringify({
          status: result.status,
          summary: result.summary,
          steps: result.steps,
          error: result.error,
        }),
      );
    } catch (e) {
      return err("UI-TARS execution failed", e);
    }
  },
);

server.tool(
  "computer_use_verify",
  "Take a screenshot and use the UI-TARS vision model to verify the current screen matches the given description. Returns 'match' if the UI looks correct, or describes what is wrong.",
  {
    description: z
      .string()
      .describe(
        "Description of what should be visible on screen (e.g., 'The login page with email and password fields')",
      ),
  },
  async ({ description }) => {
    try {
      const result = await verifyWithUITars(description);
      return ok(
        JSON.stringify({
          match: result.summary.toLowerCase().includes("match"),
          description: result.summary,
          steps: result.steps,
        }),
      );
    } catch (e) {
      return err("UI-TARS verification failed", e);
    }
  },
);

server.tool(
  "computer_use_pause",
  "Pause the currently running UI-TARS GUI automation task. The agent will wait at its current step.",
  {},
  async () => {
    try {
      return ok(pauseGUIAgent());
    } catch (e) {
      return err("Pause failed", e);
    }
  },
);

server.tool(
  "computer_use_resume",
  "Resume a paused UI-TARS GUI automation task.",
  {},
  async () => {
    try {
      return ok(resumeGUIAgent());
    } catch (e) {
      return err("Resume failed", e);
    }
  },
);

server.tool(
  "computer_use_stop",
  "Stop the currently running UI-TARS GUI automation task immediately.",
  {},
  async () => {
    try {
      return ok(stopGUIAgent());
    } catch (e) {
      return err("Stop failed", e);
    }
  },
);

async function main() {
  process.stderr.write("[gal-computer-use-mcp] Starting MCP server v0.1.0\n");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    "[gal-computer-use-mcp] MCP server connected and ready\n",
  );
}

main().catch((error) => {
  process.stderr.write(`[gal-computer-use-mcp] Fatal error: ${error}\n`);
  process.exit(1);
});
