// Unit tests for the Windows (win32) actuation pure logic — the SendKeys escaping + key mapping.
// The actuation itself needs a Windows desktop (validated on real Windows: screen-size, mouse-position,
// SetCursorPos, mouse_event click, SendKeys all work; screenshot needs an interactive session). These
// tests cover the cross-platform-runnable string logic.
//
// Run locally:  node --test --experimental-strip-types test/win.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeSendKeys, sendKeysToken } from "../src/win.ts";

describe("escapeSendKeys", () => {
  it("brace-escapes SendKeys metacharacters so they type literally", () => {
    assert.equal(escapeSendKeys("a+b^c%d~e"), "a{+}b{^}c{%}d{~}e");
    assert.equal(escapeSendKeys("(x)[y]{z}"), "{(}x{)}{[}y{]}{{}z{}}");
  });
  it("leaves ordinary text untouched", () => {
    assert.equal(escapeSendKeys("SIM-FINAL-001"), "SIM-FINAL-001");
    assert.equal(escapeSendKeys("hello world 42"), "hello world 42");
  });
});

describe("sendKeysToken", () => {
  it("maps named keys to SendKeys tokens", () => {
    assert.equal(sendKeysToken("Return"), "{ENTER}");
    assert.equal(sendKeysToken("Enter"), "{ENTER}");
    assert.equal(sendKeysToken("Tab"), "{TAB}");
    assert.equal(sendKeysToken("Escape"), "{ESC}");
    assert.equal(sendKeysToken("Up"), "{UP}");
  });
  it("passes a single char through (escaped)", () => {
    assert.equal(sendKeysToken("a"), "a");
    assert.equal(sendKeysToken("+"), "{+}");
  });
  it("wraps an unknown multi-char key as a token", () => {
    assert.equal(sendKeysToken("F5"), "{F5}");
    assert.equal(sendKeysToken("pgdn"), "{PGDN}");
  });
  it("strips stray braces from an unknown key so the token can't be malformed", () => {
    assert.equal(sendKeysToken("fo}o"), "{FOO}");
  });
});
