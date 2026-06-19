import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("getApprovedConfig", () => {
 beforeEach(() => {
 vi.resetModules();
 vi.clearAllMocks();
 vi.stubGlobal("fetch", vi.fn());
 getSessionData.mockResolvedValue("tok-123");
 });

 it("maps the API response into ApprovedConfig with synthesised IDs", async () => {
 // The real API returns commands/hooks/subagents without `id` fields
 const apiResponse = {
 approved: true,
 commands: [
 {
 name: "jira-sprint-share",
 content: "echo sprint",
 },
 ],
 hooks: [
 {
 name: "pre-commit",
 content: "lint-staged",
 },
 ],
 subagents: [
 {
 name: "reviewer",
 content: "You are a code reviewer",
 },
 ],
 rules: [
 {
 name: "security",
 content: "Never hardcode secrets",
 },
 ],
 platform: "claude",
 version: "42",
 approvedAt: "2026-03-01T00:00:00Z",
 approvedBy: "admin",
 };

 vi.mocked(fetch).mockResolvedValueOnce({
 ok: true,
 json: async () => apiResponse,
 } as Response);

 const { getApprovedConfig } = await import("../src/lib/api");
 const config = await getApprovedConfig("example-org");

 // Verify commands get synthesised IDs
 expect(config).not.toBeNull();
 expect(config!.commands).toHaveLength(1);
 expect(config!.commands![0]).toEqual({
 id: "cmd-0-jira-sprint-share",
 name: "jira-sprint-share",
 content: "echo sprint",
 sourceRepo: undefined,
 sourcePath: undefined,
 });

 // Verify hooks get synthesised IDs
 expect(config!.hooks).toHaveLength(1);
 expect(config!.hooks![0]).toEqual({
 id: "hook-0-pre-commit",
 name: "pre-commit",
 content: "lint-staged",
 sourceRepo: undefined,
 sourcePath: undefined,
 });

 // Verify subagents get synthesised IDs
 expect(config!.subagents).toHaveLength(1);
 expect(config!.subagents![0]).toEqual({
 id: "agent-0-reviewer",
 name: "reviewer",
 content: "You are a code reviewer",
 sourceRepo: undefined,
 sourcePath: undefined,
 });

 // Verify rules (no id needed)
 expect(config!.rules).toHaveLength(1);
 expect(config!.rules![0]).toEqual({
 name: "security",
 content: "Never hardcode secrets",
 });

 // Verify top-level fields
 expect(config!.approved).toBe(true);
 expect(config!.platform).toBe("claude");
 expect(config!.version).toBe("42");

 expect(fetch).toHaveBeenCalledWith("https://api.gal.run/organizations/example-org/approved-config?platform=claude",
 expect.objectContaining({
 credentials: "include",
 headers: expect.objectContaining({
 Authorization: "Bearer tok-123",
 "Content-Type": "application/json",
 }),
 }),);
 });

 it("returns null when API reports approved: false", async () => {
 vi.mocked(fetch).mockResolvedValueOnce({
 ok: true,
 json: async () => ({
 approved: false,
 message: "No approved config found for platform 'claude'",
 code: "CONFIG_NOT_FOUND",
 }),
 } as Response);

 const { getApprovedConfig } = await import("../src/lib/api");

 await expect(getApprovedConfig("example-org")).resolves.toBeNull();
 });

 it("returns null when the approved config request fails", async () => {
 const consoleError = vi
.spyOn(console, "error")
.mockImplementation(() => undefined);
 vi.mocked(fetch).mockResolvedValueOnce({
 ok: false,
 status: 500,
 text: async () => "boom",
 } as Response);

 const { getApprovedConfig } = await import("../src/lib/api");

 await expect(getApprovedConfig("example-org")).resolves.toBeNull();
 expect(consoleError).toHaveBeenCalledWith("Failed to get approved config:",
 expect.any(Error),);
 });
});
