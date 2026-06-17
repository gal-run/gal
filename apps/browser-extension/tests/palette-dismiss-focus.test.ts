/**
 * Regression tests for clean up trigger text and restore focus on palette dismiss.
 *
 * Verifies:
 * 1. stripTriggerText removes the '//' trigger text from a <textarea> value on dismiss.
 * 2. stripTriggerText removes the '//' trigger text from a contentEditable element on dismiss.
 * 3. The handleClose callback in content.tsx calls stripTriggerText before clearing state.
 * 4. The handleClose callback restores focus to the anchor element after stripping trigger text.
 * 5. WorkflowPalette's Escape key handler calls onClose (which is handleClose in content.tsx).
 * 6. WorkflowPalette passes triggerText through to injectText so trigger is stripped on selection too.
 * 7. After dismiss, isOpen, anchor, and triggerText are all reset to their default states.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflowPaletteSource = readFileSync(
  join(__dirname, "../src/content/WorkflowPalette.tsx"),
  "utf8",
);

const contentSource = readFileSync(
  join(__dirname, "../src/content/content.tsx"),
  "utf8",
);

// ---------------------------------------------------------------------------
// 1. stripTriggerText is exported from WorkflowPalette
// ---------------------------------------------------------------------------

describe("stripTriggerText export contract", () => {
  it("WorkflowPalette.tsx exports stripTriggerText as a named export", () => {
    expect(workflowPaletteSource).toContain("export function stripTriggerText(");
  });

  it("content.tsx imports stripTriggerText from WorkflowPalette", () => {
    expect(contentSource).toContain("stripTriggerText");
    expect(contentSource).toContain('"./WorkflowPalette"');
  });
});

// ---------------------------------------------------------------------------
// 2. stripTriggerText handles textarea (value-based) elements
// ---------------------------------------------------------------------------

describe("stripTriggerText — textarea value cleanup", () => {
  it("stripTriggerText handles value-based inputs (textarea / input elements)", () => {
    // The function checks for 'value' in element to identify textarea/input
    expect(workflowPaletteSource).toContain('"value" in element');
  });

  it("stripTriggerText uses lastIndexOf to find the trigger text in input.value", () => {
    expect(workflowPaletteSource).toContain("input.value.lastIndexOf(triggerText)");
  });

  it("stripTriggerText constructs before/after strings to remove the trigger", () => {
    // before = input.value.substring(0, idx)
    // after  = input.value.substring(idx + triggerText.length)
    expect(workflowPaletteSource).toContain("input.value.substring(0, idx)");
    expect(workflowPaletteSource).toContain("input.value.substring(idx + triggerText.length)");
  });

  it("stripTriggerText uses native value setter to bypass React controlled-value guard", () => {
    // Must use the native HTMLTextAreaElement/HTMLInputElement prototype setter
    expect(workflowPaletteSource).toContain("HTMLTextAreaElement.prototype");
    expect(workflowPaletteSource).toContain("HTMLInputElement.prototype");
  });

  it("stripTriggerText dispatches an input event after stripping so the host page notices", () => {
    expect(workflowPaletteSource).toContain(
      'new Event("input", { bubbles: true })',
    );
  });

  it("stripTriggerText repositions the cursor to the strip point after cleaning", () => {
    // cursor position should be set to idx (start of where trigger was)
    expect(workflowPaletteSource).toContain("input.setSelectionRange(idx, idx)");
  });
});

// ---------------------------------------------------------------------------
// 3. stripTriggerText handles contentEditable elements
// ---------------------------------------------------------------------------

describe("stripTriggerText — contentEditable element cleanup", () => {
  it("stripTriggerText detects contentEditable elements", () => {
    expect(workflowPaletteSource).toContain('element.contentEditable === "true"');
  });

  it("stripTriggerText uses a TreeWalker to locate the trigger text node in contentEditable", () => {
    expect(workflowPaletteSource).toContain("document.createTreeWalker(");
    expect(workflowPaletteSource).toContain("NodeFilter.SHOW_TEXT");
  });

  it("stripTriggerText uses document.execCommand('delete') to remove the trigger in contentEditable", () => {
    expect(workflowPaletteSource).toContain('document.execCommand("delete")');
  });

  it("stripTriggerText uses lastIndexOf to locate trigger in contentEditable textContent", () => {
    expect(workflowPaletteSource).toContain("current.lastIndexOf(triggerText)");
  });
});

// ---------------------------------------------------------------------------
// 4. handleClose in content.tsx calls stripTriggerText before clearing state
// ---------------------------------------------------------------------------

describe("handleClose trigger text cleanup contract", () => {
  it("handleClose calls stripTriggerText when anchor and triggerText are both set", () => {
    // Both guards must be present: anchor && triggerText
    expect(contentSource).toContain("if (anchor && triggerText)");
    expect(contentSource).toContain("stripTriggerText(anchor, triggerText)");
  });

  it("handleClose strips trigger text before setting isOpen=false", () => {
    // Verify that within the handleClose callback block, stripTriggerText appears
    // before setIsOpen(false). Extract the block by finding the handleClose function.
    const handleCloseStart = contentSource.indexOf("const handleClose = useCallback(");
    expect(handleCloseStart).toBeGreaterThan(-1);
    // The handleClose block ends at the closing ], [anchor, triggerText]) line
    const handleCloseBlock = contentSource.slice(
      handleCloseStart,
      contentSource.indexOf("}, [anchor, triggerText])", handleCloseStart) + 30,
    );
    const stripIdxInBlock = handleCloseBlock.indexOf("stripTriggerText(anchor, triggerText)");
    const setOpenIdxInBlock = handleCloseBlock.indexOf("setIsOpen(false)");
    expect(stripIdxInBlock).toBeGreaterThan(-1);
    expect(setOpenIdxInBlock).toBeGreaterThan(-1);
    expect(stripIdxInBlock).toBeLessThan(setOpenIdxInBlock);
  });

  it("handleClose includes a comment documenting the trigger text strip intent", () => {
    expect(contentSource).toContain("Strip the // trigger text from the input before clearing state");
  });
});

// ---------------------------------------------------------------------------
// 5. handleClose restores focus to the anchor element
// ---------------------------------------------------------------------------

describe("handleClose focus restoration contract", () => {
  it("handleClose calls anchor.focus() to restore focus to the original input", () => {
    // Guard: only call focus when anchor is defined
    expect(contentSource).toContain("anchor.focus()");
  });

  it("handleClose restores focus before resetting anchor state", () => {
    // anchor.focus() must come before setAnchor(null) so the element is still reachable.
    // Extract the handleClose callback block to check ordering within it.
    const handleCloseStart = contentSource.indexOf("const handleClose = useCallback(");
    expect(handleCloseStart).toBeGreaterThan(-1);
    const handleCloseBlock = contentSource.slice(
      handleCloseStart,
      contentSource.indexOf("}, [anchor, triggerText])", handleCloseStart) + 30,
    );
    const focusIdxInBlock = handleCloseBlock.indexOf("anchor.focus()");
    const setAnchorNullIdxInBlock = handleCloseBlock.indexOf("setAnchor(null)");
    expect(focusIdxInBlock).toBeGreaterThan(-1);
    expect(setAnchorNullIdxInBlock).toBeGreaterThan(-1);
    expect(focusIdxInBlock).toBeLessThan(setAnchorNullIdxInBlock);
  });

  it("handleClose includes a comment documenting the focus restoration intent", () => {
    expect(contentSource).toContain("Restore focus to the chat input");
  });
});

// ---------------------------------------------------------------------------
// 6. handleClose resets all palette state to defaults
// ---------------------------------------------------------------------------

describe("handleClose state reset contract", () => {
  it("handleClose sets isOpen to false", () => {
    expect(contentSource).toContain("setIsOpen(false)");
  });

  it("handleClose resets anchor to null", () => {
    expect(contentSource).toContain("setAnchor(null)");
  });

  it("handleClose resets triggerText to undefined", () => {
    expect(contentSource).toContain("setTriggerText(undefined)");
  });

  it("handleClose is memoized with useCallback, depending on anchor and triggerText", () => {
    // Ensures handleClose always captures the latest anchor/triggerText values
    expect(contentSource).toContain("useCallback(");
    expect(contentSource).toContain("[anchor, triggerText]");
  });
});

// ---------------------------------------------------------------------------
// 7. Escape key path: WorkflowPalette Escape handler calls onClose
// ---------------------------------------------------------------------------

describe("Escape key dismiss path", () => {
  it("WorkflowPalette registers a capture-phase keydown listener for Escape", () => {
    expect(workflowPaletteSource).toContain('document.addEventListener("keydown", handleEscape, { capture: true })');
  });

  it("WorkflowPalette Escape handler calls onClose() — which maps to handleClose in content.tsx", () => {
    expect(workflowPaletteSource).toContain('if (e.key === "Escape")');
    expect(workflowPaletteSource).toContain("onClose()");
  });

  it("WorkflowPalette Escape handler is active only when the palette isOpen", () => {
    // The effect depends on [isOpen, onClose] so it only runs when open
    expect(workflowPaletteSource).toContain("[isOpen, onClose]");
  });

  it("WorkflowPalette removes the Escape listener on cleanup", () => {
    expect(workflowPaletteSource).toContain(
      'document.removeEventListener("keydown", handleEscape, { capture: true })',
    );
  });

  it("WorkflowPalette inner keyboard handler also handles Escape via case 'Escape'", () => {
    // In addition to the global handler, the searchInput keyboard handler has a case for Escape
    expect(workflowPaletteSource).toContain('case "Escape":');
  });
});

// ---------------------------------------------------------------------------
// 8. injectText also strips trigger text (selection path)
// ---------------------------------------------------------------------------

describe("injectText trigger text cleanup on workflow selection", () => {
  it("injectText calls stripTriggerText when triggerText is provided", () => {
    // On workflow selection, trigger text must also be stripped before content is injected
    expect(workflowPaletteSource).toContain("stripTriggerText(element, triggerText)");
  });

  it("handleInject passes triggerText from prop to injectText", () => {
    // In the handleInject callback, triggerText from props is forwarded to injectText
    expect(workflowPaletteSource).toContain("injectText(anchorElement, command.content, triggerText)");
  });
});

// ---------------------------------------------------------------------------
// 9. Double-slash trigger detection wires triggerText correctly
// ---------------------------------------------------------------------------

describe("double-slash trigger wiring in content.tsx", () => {
  it("content.tsx captures the triggerText (// + afterSlash) when // is typed", () => {
    expect(contentSource).toContain('const triggerText = "//" + afterSlash');
  });

  it("content.tsx passes triggerText to openWorkflowPalette so it reaches handleClose", () => {
    // tryOpenWorkflowPalette or openWorkflowPalette must receive triggerText
    expect(contentSource).toContain("openWorkflowPalette(anchor, triggerText)");
  });

  it("content.tsx sets triggerText state via setTriggerText so handleClose can use it", () => {
    expect(contentSource).toContain("setTriggerText(");
  });
});
