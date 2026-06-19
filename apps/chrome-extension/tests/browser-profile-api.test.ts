import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureExceptionWithTags = vi.fn();
const clearUserSession = vi.fn();
const getSessionData = vi.fn();

vi.mock("../src/lib/sentry", () => ({
 captureExceptionWithTags,
}));

vi.mock("../src/lib/storage", () => ({
 clearUserSession,
 getSessionData,
}));

describe("createBrowserProfile", () => {
 beforeEach(() => {
 vi.resetModules();
 vi.clearAllMocks();
 getSessionData.mockResolvedValue("tok-123");
 vi.stubGlobal("fetch", vi.fn());
 vi.stubGlobal("chrome", {
 runtime: { id: "ext-test-123" },
 });
 });

 afterEach(() => {
 vi.unstubAllGlobals();
 });

 it("posts browser profiles without requiring manual domain input", async () => {
 vi.mocked(fetch).mockResolvedValueOnce({
 ok: true,
 json: async () => ({ id: "profile-123" }),
 } as Response);

 const { createBrowserProfile } = await import("../src/lib/api");

 await expect(createBrowserProfile({
 name: "GitHub Session",
 storageState: '{"cookies":[],"origins":[]}',
 }),).resolves.toEqual({
 success: true,
 id: "profile-123",
 });

 expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/browser-profiles"),
 expect.objectContaining({
 method: "POST",
 credentials: "include",
 body: JSON.stringify({
 name: "GitHub Session",
 storageState: '{"cookies":[],"origins":[]}',
 }),
 headers: expect.objectContaining({
 "Content-Type": "application/json",
 Authorization: "Bearer tok-123",
 }),
 }),);
 });

 it("returns a structured failure when the browser-profile upload is rejected", async () => {
 vi.mocked(fetch).mockResolvedValueOnce({
 ok: false,
 status: 400,
 text: async () => "storageState must be valid JSON",
 headers: new Headers(),
 } as Response);

 const { createBrowserProfile } = await import("../src/lib/api");

 await expect(createBrowserProfile({
 name: "Broken Session",
 storageState: "{not json",
 }),).resolves.toEqual({
 success: false,
 error: "storageState must be valid JSON",
 });
 });
});
