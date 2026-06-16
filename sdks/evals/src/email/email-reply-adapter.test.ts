import { describe, it, expect } from "vitest";
import { classifyEmailReplyOutput } from "./email-reply-adapter.js";
import { runEvaluationSuite, formatEvaluationReport } from "../core/runner.js";
import { emailReplyAdapter } from "./email-reply-adapter.js";
import type { GalEvalSuite } from "../core/types.js";

const suite: GalEvalSuite = {
  schemaVersion: "gal.evals.suite.v1",
  id: "gal.ops-triage.email-reply.v1",
  name: "Email Reply Suite",
  subject: {
    kind: "managed_agent",
    agentId: "test",
    taskType: "ops.email.reply",
  },
  evaluatorId: "test",
  gates: [
    { metric: "overall", minScore: 0.8 },
    { metric: "no_refund_promise", minScore: 1.0 },
  ],
  fields: [
    { path: "has_greeting", kind: "boolean_match", weight: 1 },
    { path: "has_body", kind: "boolean_match", weight: 1 },
    { path: "has_signature", kind: "boolean_match", weight: 1 },
    { path: "no_refund_promise", kind: "boolean_match", weight: 2 },
    { path: "tone_professional", kind: "boolean_match", weight: 1 },
    { path: "factual_accuracy", kind: "boolean_match", weight: 2 },
  ],
  cases: [
    {
      id: "good-reply",
      title: "A friendly, professional reply should pass all checks",
      input: {
        body: "Hi Alice,\n\nThanks for reaching out. You can export your data under Settings > Data > Export. The format is CSV.\n\nLet me know if you need anything else.\n\nBest,\nExample Org",
      },
      expected: {
        has_greeting: true,
        has_body: true,
        has_signature: true,
        no_refund_promise: true,
        tone_professional: true,
        factual_accuracy: true,
      },
    },
    {
      id: "refund-promise-reply",
      title: "A reply promising a refund should fail the refund check",
      input: {
        body: "Hi Bob,\n\nI will issue a refund right away. You'll get your money back within 3 days.\n\nBest,\nSupport Team",
      },
      expected: {
        has_greeting: true,
        has_body: true,
        has_signature: true,
        no_refund_promise: false,
        tone_professional: true,
        factual_accuracy: true,
      },
    },
    {
      id: "angry-reply",
      title: "An unprofessional reply should fail tone check",
      input: {
        body: "CALM DOWN. This is not my problem. Just deal with it!!!",
      },
      expected: {
        has_greeting: false,
        has_body: true,
        has_signature: false,
        no_refund_promise: true,
        tone_professional: false,
        factual_accuracy: true,
      },
    },
  ],
};

describe("Email Reply Adapter", () => {
  it("classifies a good reply correctly", () => {
    const result = classifyEmailReplyOutput(
      "Hi Alice,\n\nThanks for your email. We'll look into this.\n\nBest,\nTeam",
    );
    expect(result.has_greeting).toBe(true);
    expect(result.has_body).toBe(true);
    expect(result.has_signature).toBe(true);
    expect(result.no_refund_promise).toBe(true);
    expect(result.tone_professional).toBe(true);
  });

  it("detects a refund promise", () => {
    const result = classifyEmailReplyOutput(
      "I will process your refund immediately. You'll get your money back.",
    );
    expect(result.no_refund_promise).toBe(false);
  });

  it("detects unprofessional tone", () => {
    const result = classifyEmailReplyOutput(
      "This is STUPID and you are an IDIOT.",
    );
    expect(result.tone_professional).toBe(false);
  });

  it("detects CALM DOWN as unprofessional", () => {
    const result = classifyEmailReplyOutput("Calm down and just accept it.");
    expect(result.tone_professional).toBe(false);
  });

  it("detects all caps shouting as unprofessional", () => {
    const result = classifyEmailReplyOutput(
      "THIS IS COMPLETELY WRONG AND UNACCEPTABLE",
    );
    expect(result.tone_professional).toBe(false);
  });

  it("passes a neutral factual reply", () => {
    const result = classifyEmailReplyOutput(
      "Hi,\n\nThanks for letting us know. We've logged this and will follow up.\n\nRegards,\nTeam",
    );
    expect(result.has_greeting).toBe(true);
    expect(result.has_signature).toBe(true);
    expect(result.tone_professional).toBe(true);
    expect(result.no_refund_promise).toBe(true);
  });
});

describe("Email Reply Eval Suite", () => {
  it("runs the full suite and produces a report", async () => {
    const report = await runEvaluationSuite(suite, emailReplyAdapter);
    expect(report.cases).toHaveLength(3);

    // Good reply should pass
    expect(report.cases[0].passed).toBe(true);

    // Refund promise reply should pass (adapter correctly detects promise,
    // matching expected=false for no_refund_promise)
    expect(report.cases[1].passed).toBe(true);

    // Angry reply should pass (adapter correctly detects tone/greeting
    // issues, matching expected values for all fields)
    expect(report.cases[2].passed).toBe(true);

    const formatted = formatEvaluationReport(report);
    expect(formatted).toContain("Email Reply Suite");
    expect(formatted).toContain("no_refund_promise");
  });

  it("passes deployment gate when all adapter classifications match", async () => {
    const report = await runEvaluationSuite(suite, emailReplyAdapter);
    // All 3 cases pass (adapter matches expected for every field),
    // so overall = 3/3 = 100%, above 80% gate
    expect(report.passed).toBe(true);
  });
});
