// Package gal provides the pure-Go math runtime (dense/relu/softmax forward
// pass) for the GAL governance decision model — an 8->24->24->2 MLP.
//
// This OSS package ships the runtime ONLY. It embeds NO trained weights: the
// model parameters are a proprietary artifact supplied at runtime via
// LoadWeights / SetWeights (see weights.go). With no weights loaded, Infer
// fails safe and holds for operator review.
package gal

import "math"

// Model constants.
const (
	Architecture = "mlp"
	ModelRef     = "gal-model://gal/v1.2"
	SchemaRef    = "https://gal.run/schemas/model/inference-response.schema.json"
)

// Labels maps output class indices to decision strings.
var Labels = [2]string{"clear_for_operator_review", "hold_for_operator_review"}

// FeatureNames are the 8 structured governance features in canonical order.
var FeatureNames = [8]string{
	"people_present", "vehicles_present", "obstacles_present",
	"evidence_complete", "operator_review_required", "latency_measured",
	"approval_refs_complete", "detection_count",
}

// Features represents the input to the governance model.
type Features struct {
	PeoplePresent        bool `json:"people_present"`
	VehiclesPresent      bool `json:"vehicles_present"`
	ObstaclesPresent     bool `json:"obstacles_present"`
	EvidenceComplete     bool `json:"evidence_complete"`
	OperatorReviewReqd   bool `json:"operator_review_required"`
	LatencyMeasured      bool `json:"latency_measured"`
	ApprovalRefsComplete bool `json:"approval_refs_complete"`
	DetectionCount       int  `json:"detection_count"`
}

// Request is an inference request.
type Request struct {
	RequestID   string   `json:"request_id"`
	Application string   `json:"application"`
	ModelRef    string   `json:"model_ref"`
	EvidenceRef string   `json:"evidence_ref"`
	Features    Features `json:"features"`
}

// Response is an inference response.
type Response struct {
	SchemaRef               string   `json:"schema_ref"`
	RequestID               string   `json:"request_id"`
	Application             string   `json:"application"`
	EvidenceRef             string   `json:"evidence_ref"`
	ModelRef                string   `json:"model_ref"`
	Architecture            string   `json:"architecture"`
	Decision                string   `json:"decision"`
	Confidence              float64  `json:"confidence"`
	CalibrationBucket       string   `json:"calibration_bucket"`
	EscalateForDeeperReview bool     `json:"escalate_for_deeper_review"`
	PolicyFindings          []string `json:"policy_findings"`
	AdvisoryOnly            bool     `json:"advisory_only"`
	PhysicalActionAllowed   bool     `json:"physical_action_allowed"`
	HardwareCommandsIssued  bool     `json:"hardware_commands_issued"`
}

func clip(v float64) float64 {
	return max(0, min(v, 1))
}

func bucket(confidence float64) string {
	if confidence >= 0.9 {
		return "high"
	}
	if confidence >= 0.75 {
		return "medium"
	}
	return "low"
}

// Encode converts Features into a float64 slice matching the training order.
func Encode(f Features) []float64 {
	return []float64{
		boolToFloat(f.PeoplePresent),
		boolToFloat(f.VehiclesPresent),
		boolToFloat(f.ObstaclesPresent),
		boolToFloat(f.EvidenceComplete),
		boolToFloat(f.OperatorReviewReqd),
		boolToFloat(f.LatencyMeasured),
		boolToFloat(f.ApprovalRefsComplete),
		clip(float64(f.DetectionCount) / 20.0),
	}
}

func boolToFloat(b bool) float64 {
	if b {
		return 1.0
	}
	return 0.0
}

// dense computes y = W*x + b.
func dense(x []float64, W [][]float64, b []float64) []float64 {
	rows := len(W)
	cols := len(W[0])
	out := make([]float64, rows)
	for i := 0; i < rows; i++ {
		sum := b[i]
		for j := 0; j < cols; j++ {
			sum += W[i][j] * x[j]
		}
		out[i] = sum
	}
	return out
}

func relu(x []float64) []float64 {
	out := make([]float64, len(x))
	for i, v := range x {
		out[i] = max(0, v)
	}
	return out
}

func softmax(x []float64) []float64 {
	m := x[0]
	for _, v := range x {
		m = max(m, v)
	}
	out := make([]float64, len(x))
	var sum float64
	for i, v := range x {
		out[i] = math.Exp(v - m)
		sum += out[i]
	}
	for i := range out {
		out[i] /= sum
	}
	return out
}

// Infer runs the full forward pass and returns a Response.
//
// In the OSS distribution no trained weights are embedded (see weights.go). If
// weights have not been supplied at runtime via LoadWeights, Infer fails safe:
// it returns a "hold_for_operator_review" response with zero confidence and
// escalation set, rather than running the forward pass against empty tensors.
func Infer(req Request) Response {
	if !weightsLoaded() {
		return Response{
			SchemaRef:               SchemaRef,
			RequestID:               req.RequestID,
			Application:             req.Application,
			EvidenceRef:             req.EvidenceRef,
			ModelRef:                ModelRef,
			Architecture:            Architecture,
			Decision:                "hold_for_operator_review",
			Confidence:              0,
			CalibrationBucket:       "low",
			EscalateForDeeperReview: true,
			PolicyFindings:          []string{"model_weights_not_loaded"},
			AdvisoryOnly:            true,
			PhysicalActionAllowed:   false,
			HardwareCommandsIssued:  false,
		}
	}

	x := Encode(req.Features)

	// Layer 0: 8->24 + ReLU
	h0 := relu(dense(x, weightsL0W, weightsL0B))

	// Layer 2: 24->24 + ReLU
	h1 := relu(dense(h0, weightsL2W, weightsL2B))

	// Layer 4: 24->2 + softmax
	logits := dense(h1, weightsL4W, weightsL4B)
	probs := softmax(logits)

	idx := 0
	if probs[1] > probs[0] {
		idx = 1
	}
	decision := Labels[idx]
	confidence := math.Round(probs[idx]*1_000_000) / 1_000_000

	return Response{
		SchemaRef:               SchemaRef,
		RequestID:               req.RequestID,
		Application:             req.Application,
		EvidenceRef:             req.EvidenceRef,
		ModelRef:                ModelRef,
		Architecture:            Architecture,
		Decision:                decision,
		Confidence:              confidence,
		CalibrationBucket:       bucket(confidence),
		EscalateForDeeperReview: decision == "hold_for_operator_review" || confidence < 0.75,
		PolicyFindings:          []string{},
		AdvisoryOnly:            true,
		PhysicalActionAllowed:   false,
		HardwareCommandsIssued:  false,
	}
}
