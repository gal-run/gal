import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorageData, getSessionData } from "../src/lib/storage";

describe("storage helpers", () => {
 beforeEach(() => {
 vi.stubGlobal("chrome", {
 storage: {
 local: {
 get: vi.fn(),
 },
 session: {
 get: vi.fn(),
 },
 },
 });
 });

 it("returns stored values for known keys", async () => {
 vi.mocked(chrome.storage.local.get).mockResolvedValue({
 selectedOrg: "example-org",
 });

 await expect(getStorageData("selectedOrg")).resolves.toBe("example-org",);
 });

 it("returns null when the key is not present", async () => {
 vi.mocked(chrome.storage.local.get).mockResolvedValue({});

 await expect(getStorageData("selectedOrg")).resolves.toBeNull();
 });

 it("reads authToken from session storage", async () => {
 vi.mocked(chrome.storage.session.get).mockResolvedValue({
 authToken: "tok-abc",
 });

 await expect(getSessionData("authToken")).resolves.toBe("tok-abc");
 });

 it("returns null from session storage when key is not present", async () => {
 vi.mocked(chrome.storage.session.get).mockResolvedValue({});

 await expect(getSessionData("authToken")).resolves.toBeNull();
 });
});
