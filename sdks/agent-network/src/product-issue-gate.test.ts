import { describe, expect, it } from 'vitest'
import {
  GAL_PRODUCT_ISSUE_GATE_SCHEMA_VERSION,
  GAL_PRODUCT_ISSUE_GATE_TASK_TYPE,
  normalizeProductStatusIssueGateRecord,
} from './product-issue-gate.js'

describe('product issue gate contract', () => {
  it('normalizes product-status issue gate records into the Agent Network contract', () => {
    const result = normalizeProductStatusIssueGateRecord({
      schema_version: 'product-status-issue-gate.v1',
      generated_at: '2026-05-15T09:30:00.000Z',
      source: 'example-org/business-ops-admin',
      issue: {
        url: 'https://example.test/owner/repo/issues/58',
        repo: 'owner/repo',
        number: 58,
        title: 'Gateway preflight',
        labels: ['maintenance'],
      },
      product: {
        product_id: 'gal',
        mapping: 'gal_run_org_default',
      },
      classification: {
        lane: 'product-integrity',
        work_class: 'product_integrity',
        confidence: 'high',
        broad: false,
        reasons: ['label:maintenance'],
      },
      product_status_decision: {
        decision: 'allow',
      },
      enforcement: {
        decision: 'warn',
        can_start_development: false,
        dispatch_state: 'eligible_after_owner_review',
        reason: 'product_integrity_requires_owner_review_before_dispatch',
        required_actions: [
          'Owner review is required before development starts; rerun with --approved only after that review.',
        ],
      },
    })

    expect(GAL_PRODUCT_ISSUE_GATE_TASK_TYPE).toBe('business-ops.product-issue-gate.evaluate')
    expect(result).toMatchObject({
      schemaVersion: GAL_PRODUCT_ISSUE_GATE_SCHEMA_VERSION,
      generatedAt: '2026-05-15T09:30:00.000Z',
      issue: {
        repo: 'owner/repo',
        number: 58,
        labels: ['maintenance'],
      },
      product: {
        productId: 'gal',
      },
      classification: {
        lane: 'product-integrity',
        workClass: 'product_integrity',
      },
      enforcement: {
        decision: 'warn',
        canStartDevelopment: false,
        dispatchState: 'eligible_after_owner_review',
        reasonCode: 'product_integrity_requires_owner_review_before_dispatch',
        message: 'Owner review is required before development starts; rerun with --approved only after that review.',
      },
    })
  })

  it('supplies a safe message when a legacy gate response only has machine fields', () => {
    const result = normalizeProductStatusIssueGateRecord({
      issue: {
        title: 'Unknown product issue',
      },
      enforcement: {
        decision: 'block',
        can_start_development: false,
        dispatch_state: 'blocked_unknown_product_status',
        reason: 'repository_not_mapped_to_product_status',
      },
    })

    expect(result.enforcement.message).toBe(
      'Product issue gate blocked development (repository_not_mapped_to_product_status).',
    )
    expect(result.enforcement.requiredActions).toEqual([])
  })
})
