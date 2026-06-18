import { describe, expect, test } from "bun:test"
import { infer, logits } from "../../src/plugin/gal-runtime"

describe("gal runtime", () => {
  test("clears a low-risk local edit path", () => {
    const out = infer({
      request_id: "req:clear",
      application: "gal-code",
      model_ref: "gal-model://governance-decision/v0",
      evidence_ref: "gal://sessions/s/tool/c",
      features: {
        people_present: false,
        vehicles_present: false,
        obstacles_present: false,
        evidence_complete: true,
        operator_review_required: false,
        latency_measured: false,
        approval_refs_complete: false,
        detection_count: 0,
      },
    })

    expect(out.decision).toBe("clear_for_operator_review")
    expect(out.confidence).toBeGreaterThan(0.5)
    expect(out.confidence).toBeLessThanOrEqual(1)
  })

  test("holds a risky remote state change", () => {
    const out = infer({
      request_id: "req:hold",
      application: "gal-code",
      model_ref: "gal-model://governance-decision/v0",
      evidence_ref: "gal://sessions/s/tool/c",
      features: {
        people_present: false,
        vehicles_present: false,
        obstacles_present: false,
        evidence_complete: true,
        operator_review_required: true,
        latency_measured: false,
        approval_refs_complete: false,
        detection_count: 2,
      },
    })

    expect(out.decision).toBe("hold_for_operator_review")
    expect(out.confidence).toBeGreaterThan(0.9)
    expect(out.escalate_for_deeper_review).toBeTrue()
  })

  test("matches the current promoted logits shape", () => {
    const out = logits({
      people_present: false,
      vehicles_present: false,
      obstacles_present: false,
      evidence_complete: true,
      operator_review_required: true,
      latency_measured: false,
      approval_refs_complete: true,
      detection_count: 1,
    })

    expect(out).toHaveLength(2)
    expect(out.every((value) => Number.isFinite(value))).toBeTrue()
  })
})
