/**
 * Regression tests — login prompt redesign with visual toolbar guide.
 *
 * Before the LoginPrompt rendered a clickable "Sign in via GAL Extension"
 * button that triggered handleSignIn → chrome.runtime.sendMessage. That flow
 * was non-functional from the content-script context and caused confusion.
 *
 * After the LoginPrompt:
 * 1. Has NO clickable sign-in / auth button — the user is directed to click
 * the extension icon in their browser toolbar instead.
 * 2. Renders a visual toolbar illustration (stylised browser chrome + GAL icon
 * pulse animation) to guide unauthenticated users.
 * 3. Keeps the backdrop onClick pointing to onClose (dismiss only) — clicking
 * the dead area does NOT trigger any login or auth flow.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflowPaletteSource = readFileSync(join(__dirname, "../src/content/WorkflowPalette.tsx"),
 "utf8",);

const contentSource = readFileSync(join(__dirname, "../src/content/content.tsx"),
 "utf8",);

describe("login prompt redesign — visual toolbar guide", () => {
 // ---------------------------------------------------------------------------
 // 1. No sign-in button rendered for unauthenticated users
 // ---------------------------------------------------------------------------

 it("does NOT render a sign-in button inside LoginPrompt (handleSignIn was removed)", () => {
 // Extract the LoginPrompt section (everything after the marker comment)
 const loginPromptSection = workflowPaletteSource.slice(workflowPaletteSource.indexOf("// ---- LoginPrompt Component ----"),);

 // The old button label must be absent
 expect(loginPromptSection).not.toContain("Sign in via GAL Extension");
 // The old handleSignIn handler must be absent
 expect(loginPromptSection).not.toContain("handleSignIn");
 // There must be no button that calls a login/auth function
 expect(loginPromptSection).not.toContain("startGitHubAuth");
 expect(loginPromptSection).not.toContain("chrome.runtime.sendMessage");
 });

 it("does NOT import or invoke startGitHubAuth inside WorkflowPalette", () => {
 expect(workflowPaletteSource).not.toContain("startGitHubAuth");
 });

 // ---------------------------------------------------------------------------
 // 2. Visual toolbar guide is present
 // ---------------------------------------------------------------------------

 it("renders a stylised browser toolbar illustration in the login prompt", () => {
 const loginPromptSection = workflowPaletteSource.slice(workflowPaletteSource.indexOf("// ---- LoginPrompt Component ----"),);

 // Toolbar illustration card comment must be present
 expect(loginPromptSection).toContain("Toolbar illustration card");
 // Stylized browser toolbar comment
 expect(loginPromptSection).toContain("Stylized browser toolbar");
 // The copy directing users to click the GAL icon in the toolbar
 expect(loginPromptSection).toContain("in your toolbar");
 // The GAL icon (recognised by the green accent path)
 expect(loginPromptSection).toContain("#00FF2A");
 });

 it("includes the galIconPulse keyframe animation to highlight the GAL toolbar icon", () => {
 const loginPromptSection = workflowPaletteSource.slice(workflowPaletteSource.indexOf("// ---- LoginPrompt Component ----"),);

 expect(loginPromptSection).toContain("galIconPulse");
 expect(loginPromptSection).toContain("rgba(0, 255, 42,");
 });

 it("shows instructional copy directing users to sign in via the extension toolbar icon", () => {
 const loginPromptSection = workflowPaletteSource.slice(workflowPaletteSource.indexOf("// ---- LoginPrompt Component ----"),);

 // Primary heading
 expect(loginPromptSection).toContain("Sign in to unlock workflows");
 // Secondary instructions
 expect(loginPromptSection).toContain("Then sign in with GitHub");
 // Re-trigger hint
 expect(loginPromptSection).toContain("again to open workflows");
 });

 it("renders a Close (X) button and an esc-key hint for dismissal — not for auth", () => {
 const loginPromptSection = workflowPaletteSource.slice(workflowPaletteSource.indexOf("// ---- LoginPrompt Component ----"),);

 // Close button with aria-label="Close"
 expect(loginPromptSection).toContain('aria-label="Close"');
 // Keyboard dismiss hint
 expect(loginPromptSection).toContain("to dismiss");
 });

 // ---------------------------------------------------------------------------
 // 3. Backdrop closes the prompt — does NOT trigger a login flow
 // ---------------------------------------------------------------------------

 it("backdrop onClick calls onClose — not a login handler", () => {
 const loginPromptSection = workflowPaletteSource.slice(workflowPaletteSource.indexOf("// ---- LoginPrompt Component ----"),);

 // The backdrop comment followed by onClick={onClose} must exist
 expect(loginPromptSection).toContain("Backdrop — closes prompt on click");

 // The very next onClick after the backdrop comment must be onClose,
 // not any auth-initiating function
 const backdropIdx = loginPromptSection.indexOf("Backdrop — closes prompt on click",);
 const onClickAfterBackdrop = loginPromptSection
.slice(backdropIdx)
.match(/onClick=\{([^}]+)\}/)?.[1]
 ?.trim();

 expect(onClickAfterBackdrop).toBe("onClose");
 });

 it("LoginPrompt JSX has exactly zero references to auth/login trigger functions", () => {
 const loginPromptSection = workflowPaletteSource.slice(workflowPaletteSource.indexOf("export function LoginPrompt("),);

 // Ensure no auth-initiating calls appear inside the component implementation
 expect(loginPromptSection).not.toContain("handleLogin");
 expect(loginPromptSection).not.toContain("launchWebAuthFlow");
 expect(loginPromptSection).not.toContain("identity.getRedirectURL");
 });

 // ---------------------------------------------------------------------------
 // 4. LoginPrompt integration in content script
 // ---------------------------------------------------------------------------

 it("content script mounts LoginPromptHost in the Shadow DOM", () => {
 expect(contentSource).toContain("LoginPromptHost");
 expect(contentSource).toContain("gal-login-prompt-root");
 expect(contentSource).toContain("loginPromptRoot.render");
 });

 it("tryOpenWorkflowPalette calls openLoginPrompt (not a login flow) when unauthenticated", () => {
 // The auth-gated wrapper should call openLoginPrompt when no authToken
 expect(contentSource).toContain("openLoginPrompt();");
 expect(contentSource).toContain("tryOpenWorkflowPalette");
 // It must NOT directly trigger auth from content script
 expect(contentSource).not.toContain("handleGitHubAuth");
 expect(contentSource).not.toContain("startGitHubAuth");
 });

 it("LoginPrompt component is exported from WorkflowPalette for use by content script", () => {
 expect(workflowPaletteSource).toContain("export function LoginPrompt(");
 expect(workflowPaletteSource).toContain("export interface LoginPromptProps");
 // content script imports it
 expect(contentSource).toContain("WorkflowPalette, LoginPrompt, stripTriggerText",);
 });

 // ---------------------------------------------------------------------------
 // 5. Escape-key dismiss wired correctly
 // ---------------------------------------------------------------------------

 it("LoginPrompt listens for Escape key to dismiss — without calling any auth function", () => {
 const loginPromptSection = workflowPaletteSource.slice(workflowPaletteSource.indexOf("export function LoginPrompt("),);

 expect(loginPromptSection).toContain('e.key === "Escape"');
 expect(loginPromptSection).toContain("onClose()");
 // Escape handler must not initiate auth
 const escapeHandlerBlock = loginPromptSection.slice(loginPromptSection.indexOf("e.key === \"Escape\""),
 loginPromptSection.indexOf("e.key === \"Escape\"") + 200,);
 expect(escapeHandlerBlock).not.toContain("startGitHubAuth");
 expect(escapeHandlerBlock).not.toContain("handleSignIn");
 });

 // ---------------------------------------------------------------------------
 // 6. Login-prompt open animation (galLoginPromptOpen) is defined
 // ---------------------------------------------------------------------------

 it("defines galLoginPromptOpen keyframe animation for smooth entrance", () => {
 const loginPromptSection = workflowPaletteSource.slice(workflowPaletteSource.indexOf("// ---- LoginPrompt Component ----"),);

 expect(loginPromptSection).toContain("@keyframes galLoginPromptOpen");
 expect(loginPromptSection).toContain("animation: \"galLoginPromptOpen");
 });
});
