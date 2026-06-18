import { GalModel } from "./gal-model.gen"

export type GalFeatures = {
  people_present: boolean
  vehicles_present: boolean
  obstacles_present: boolean
  evidence_complete: boolean
  operator_review_required: boolean
  latency_measured: boolean
  approval_refs_complete: boolean
  detection_count: number
}

export type GalRequest = {
  request_id: string
  application: string
  model_ref: string
  evidence_ref: string
  features: GalFeatures
}

export type GalResponse = {
  schema_ref: "https://gal.run/schemas/model/inference-response.schema.json"
  request_id: string
  application: string
  evidence_ref: string
  model_ref: string
  architecture: string
  decision: string
  confidence: number
  calibration_bucket: "high" | "medium" | "low"
  escalate_for_deeper_review: boolean
  policy_findings: []
  advisory_only: true
  physical_action_allowed: false
  hardware_commands_issued: false
}

const REF = "https://gal.run/schemas/model/inference-response.schema.json"

function clip(value: number) {
  return Math.max(0, Math.min(value, 1))
}

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function dense(input: readonly number[], weight: readonly (readonly number[])[], bias: readonly number[]) {
  return weight.map((row, i) => row.reduce((sum, value, j) => sum + value * input[j], bias[i] ?? 0))
}

function relu(values: readonly number[]) {
  return values.map((value) => Math.max(0, value))
}

function softmax(values: readonly number[]) {
  const top = Math.max(...values)
  const exp = values.map((value) => Math.exp(value - top))
  const sum = exp.reduce((total, value) => total + value, 0)
  return exp.map((value) => value / sum)
}

function bucket(confidence: number) {
  if (confidence >= 0.9) return "high"
  if (confidence >= 0.75) return "medium"
  return "low"
}

export function encode(features: GalFeatures) {
  const f = features
  const map = {
    people_present: f.people_present ? 1 : 0,
    vehicles_present: f.vehicles_present ? 1 : 0,
    obstacles_present: f.obstacles_present ? 1 : 0,
    evidence_complete: f.evidence_complete ? 1 : 0,
    operator_review_required: f.operator_review_required ? 1 : 0,
    latency_measured: f.latency_measured ? 1 : 0,
    approval_refs_complete: f.approval_refs_complete ? 1 : 0,
    detection_count_norm: clip((f.detection_count ?? 0) / 20),
  } satisfies Record<(typeof GalModel.feature_names)[number], number>
  return GalModel.feature_names.map((name) => map[name])
}

export function logits(features: GalFeatures) {
  const values = encode(features)
  const hidden0 = relu(
    dense(values, GalModel.weights["layers.0.weight"], GalModel.weights["layers.0.bias"]),
  )
  const hidden1 = relu(
    dense(
      hidden0,
      GalModel.weights["layers.2.weight"],
      GalModel.weights["layers.2.bias"],
    ),
  )
  return dense(
    hidden1,
    GalModel.weights["layers.4.weight"],
    GalModel.weights["layers.4.bias"],
  )
}

export function infer(request: GalRequest): GalResponse {
  const scores = softmax(logits(request.features))
  const index = scores[0] >= scores[1] ? 0 : 1
  const confidence = scores[index] ?? 0
  const decision = GalModel.labels[index] ?? GalModel.labels[0]
  return {
    schema_ref: REF,
    request_id: request.request_id,
    application: request.application,
    evidence_ref: request.evidence_ref,
    model_ref: GalModel.model_ref,
    architecture: GalModel.architecture,
    decision,
    confidence: round(confidence),
    calibration_bucket: bucket(confidence),
    escalate_for_deeper_review: decision === "hold_for_operator_review" || confidence < 0.75,
    policy_findings: [],
    advisory_only: true,
    physical_action_allowed: false,
    hardware_commands_issued: false,
  }
}
