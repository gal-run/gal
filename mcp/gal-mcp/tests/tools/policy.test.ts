import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GalApiClient } from "../../src/api-client.js";

const toolHandlers = new Map<string, Function>();

const mockServer = {
  tool: vi.fn((...args: unknown[]) => {
    const name = args[0] as string;
    const handler = (args.length === 3 ? args[2] : args[3]) as Function;
    toolHandlers.set(name, handler);
  }),
};

const mockApiClient = {
  createPolicy: vi.fn(),
  listPolicies: vi.fn(),
  getPolicy: vi.fn(),
  reviewPolicy: vi.fn(),
  updatePolicyEnforcement: vi.fn(),
  checkOrgPolicy: vi.fn(),
  checkSpecificPolicy: vi.fn(),
} as unknown as GalApiClient;

describe("Policy Tools", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    toolHandlers.clear();
    mockServer.tool.mockClear();

    const { registerPolicyTools } =
      await import("../../src/tools/policy-tools.js");
    registerPolicyTools(mockServer as any, mockApiClient);
  });

  it("registers all 7 policy tools", () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(7);
    expect(toolHandlers.has("gal_policy_propose")).toBe(true);
    expect(toolHandlers.has("gal_policy_list")).toBe(true);
    expect(toolHandlers.has("gal_policy_get")).toBe(true);
    expect(toolHandlers.has("gal_policy_approve")).toBe(true);
    expect(toolHandlers.has("gal_policy_reject")).toBe(true);
    expect(toolHandlers.has("gal_policy_check")).toBe(true);
    expect(toolHandlers.has("gal_policy_set_enforcement")).toBe(true);
  });

  describe("gal_policy_propose", () => {
    it("creates a policy proposal", async () => {
      const mockPolicy = {
        id: "policy-123",
        name: "distribution-first-v1",
        status: "draft",
      };
      (
        mockApiClient.createPolicy as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ policy: mockPolicy });

      const handler = toolHandlers.get("gal_policy_propose")!;
      const result = await handler({
        orgName: "test-org",
        name: "distribution-first-v1",
        description: "Enforce product discipline",
        type: "distribution-first",
        rationale: "Need to ensure market validation before feature work",
        rules: [
          {
            id: "rule-1",
            name: "Check distribution status",
            condition: {
              type: "work_type",
              operator: "in",
              value: ["feature", "migration"],
            },
            action: "warn",
            message: "Check distribution status first",
          },
        ],
        enforcement: { enabled: true, mode: "warn", scope: "org" },
      });

      expect(mockApiClient.createPolicy).toHaveBeenCalledWith(
        "test-org",
        expect.objectContaining({
          name: "distribution-first-v1",
          type: "distribution-first",
        }),
      );
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.policy.name).toBe("distribution-first-v1");
    });

    it("returns error when API fails", async () => {
      (
        mockApiClient.createPolicy as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("GAL API error 403: Admin required"));

      const handler = toolHandlers.get("gal_policy_propose")!;
      const result = await handler({
        orgName: "test-org",
        name: "test-policy",
        description: "Test",
        type: "custom",
        rationale: "Testing",
        rules: [],
        enforcement: { enabled: false, mode: "off", scope: "org" },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error creating policy");
    });
  });

  describe("gal_policy_list", () => {
    it("lists policies for an org", async () => {
      const mockPolicies = [
        { id: "p1", name: "Policy 1", status: "approved" },
        { id: "p2", name: "Policy 2", status: "draft" },
      ];
      (
        mockApiClient.listPolicies as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        policies: mockPolicies,
        total: 2,
      });

      const handler = toolHandlers.get("gal_policy_list")!;
      const result = await handler({ orgName: "test-org" });

      expect(mockApiClient.listPolicies).toHaveBeenCalledWith(
        "test-org",
        undefined,
      );
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.policies).toHaveLength(2);
    });

    it("filters by status and type", async () => {
      (
        mockApiClient.listPolicies as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        policies: [],
        total: 0,
      });

      const handler = toolHandlers.get("gal_policy_list")!;
      await handler({
        orgName: "test-org",
        status: "approved",
        type: "distribution-first",
      });

      expect(mockApiClient.listPolicies).toHaveBeenCalledWith("test-org", {
        status: "approved",
        type: "distribution-first",
      });
    });
  });

  describe("gal_policy_get", () => {
    it("gets a specific policy by ID", async () => {
      const mockPolicy = {
        id: "policy-123",
        name: "Test Policy",
        status: "approved",
        rules: [],
      };
      (
        mockApiClient.getPolicy as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ policy: mockPolicy });

      const handler = toolHandlers.get("gal_policy_get")!;
      const result = await handler({
        policyId: "policy-123",
        orgName: "test-org",
      });

      expect(mockApiClient.getPolicy).toHaveBeenCalledWith(
        "test-org",
        "policy-123",
      );
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.policy.id).toBe("policy-123");
    });

    it("returns error for non-existent policy", async () => {
      (
        mockApiClient.getPolicy as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("GAL API error 404: Policy not found"));

      const handler = toolHandlers.get("gal_policy_get")!;
      const result = await handler({
        policyId: "nonexistent",
        orgName: "test-org",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error getting policy");
    });
  });

  describe("gal_policy_approve", () => {
    it("approves a policy", async () => {
      const mockPolicy = { id: "policy-123", status: "approved" };
      (
        mockApiClient.reviewPolicy as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ policy: mockPolicy });

      const handler = toolHandlers.get("gal_policy_approve")!;
      const result = await handler({
        policyId: "policy-123",
        orgName: "test-org",
        comment: "LGTM",
      });

      expect(mockApiClient.reviewPolicy).toHaveBeenCalledWith(
        "test-org",
        "policy-123",
        {
          action: "approve",
          comment: "LGTM",
        },
      );
      expect(result.isError).toBeUndefined();
    });
  });

  describe("gal_policy_reject", () => {
    it("rejects a policy with a reason", async () => {
      const mockPolicy = { id: "policy-123", status: "rejected" };
      (
        mockApiClient.reviewPolicy as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ policy: mockPolicy });

      const handler = toolHandlers.get("gal_policy_reject")!;
      const result = await handler({
        policyId: "policy-123",
        orgName: "test-org",
        comment: "Needs more work",
      });

      expect(mockApiClient.reviewPolicy).toHaveBeenCalledWith(
        "test-org",
        "policy-123",
        {
          action: "reject",
          comment: "Needs more work",
        },
      );
      expect(result.isError).toBeUndefined();
    });
  });

  describe("gal_policy_check", () => {
    it("checks org policies with context", async () => {
      const mockDecision = {
        allowed: true,
        mode: "warn",
        policyId: "policy-123",
        reasons: [],
      };
      (
        mockApiClient.checkOrgPolicy as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(mockDecision);

      const handler = toolHandlers.get("gal_policy_check")!;
      const result = await handler({
        orgName: "test-org",
        context: {
          workType: "feature",
          repo: "owner/repo",
          issueNumber: 42,
        },
      });

      expect(mockApiClient.checkOrgPolicy).toHaveBeenCalledWith("test-org", {
        workType: "feature",
        repo: "owner/repo",
        issueNumber: 42,
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.allowed).toBe(true);
    });

    it("checks a specific policy when policyId is provided", async () => {
      const mockDecision = {
        allowed: false,
        mode: "block",
        policyId: "policy-456",
        reasons: [{ ruleId: "r1", message: "Blocked" }],
      };
      (
        mockApiClient.checkSpecificPolicy as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(mockDecision);

      const handler = toolHandlers.get("gal_policy_check")!;
      const result = await handler({
        orgName: "test-org",
        policyId: "policy-456",
        context: { workType: "migration" },
      });

      expect(mockApiClient.checkSpecificPolicy).toHaveBeenCalledWith(
        "test-org",
        "policy-456",
        {
          workType: "migration",
        },
      );
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.allowed).toBe(false);
    });
  });

  describe("gal_policy_set_enforcement", () => {
    it("updates enforcement settings", async () => {
      const mockPolicy = {
        id: "policy-123",
        enforcement: { enabled: true, mode: "block" },
      };
      (
        mockApiClient.updatePolicyEnforcement as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ policy: mockPolicy });

      const handler = toolHandlers.get("gal_policy_set_enforcement")!;
      const result = await handler({
        policyId: "policy-123",
        orgName: "test-org",
        enabled: true,
        mode: "block",
      });

      expect(mockApiClient.updatePolicyEnforcement).toHaveBeenCalledWith(
        "test-org",
        "policy-123",
        {
          enabled: true,
          mode: "block",
        },
      );
      expect(result.isError).toBeUndefined();
    });

    it("updates scope and repoScope", async () => {
      (
        mockApiClient.updatePolicyEnforcement as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ policy: {} });

      const handler = toolHandlers.get("gal_policy_set_enforcement")!;
      await handler({
        policyId: "policy-123",
        orgName: "test-org",
        scope: "repo",
        repoScope: ["owner/repo1", "owner/repo2"],
      });

      expect(mockApiClient.updatePolicyEnforcement).toHaveBeenCalledWith(
        "test-org",
        "policy-123",
        {
          scope: "repo",
          repoScope: ["owner/repo1", "owner/repo2"],
        },
      );
    });
  });
});
