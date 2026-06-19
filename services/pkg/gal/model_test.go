package gal

import (
	"bytes"
	"encoding/json"
	"testing"
)

// resetWeights clears any runtime-loaded weights so each test controls its own
// load state. The OSS distribution ships no embedded weights.
func resetWeights() {
	weightsL0W, weightsL0B = nil, nil
	weightsL2W, weightsL2B = nil, nil
	weightsL4W, weightsL4B = nil, nil
}

// syntheticWeights builds a valid-shaped (NOT trained) weight set so the math
// runtime can be exercised in tests without shipping the proprietary model.
func syntheticWeights() Weights {
	mk := func(rows, cols int, v float64) [][]float64 {
		m := make([][]float64, rows)
		for i := range m {
			m[i] = make([]float64, cols)
			for j := range m[i] {
				m[i][j] = v
			}
		}
		return m
	}
	vec := func(n int, v float64) []float64 {
		b := make([]float64, n)
		for i := range b {
			b[i] = v
		}
		return b
	}
	return Weights{
		L0W: mk(24, 8, 0.0), L0B: vec(24, 0.0),
		L2W: mk(24, 24, 0.0), L2B: vec(24, 0.0),
		L4W: mk(2, 24, 0.0), L4B: []float64{0.0, 0.0},
	}
}

func TestInferFailsSafeWithoutWeights(t *testing.T) {
	resetWeights()
	resp := Infer(Request{RequestID: "test-nw", Features: Features{EvidenceComplete: true}})
	if resp.Decision != "hold_for_operator_review" {
		t.Fatalf("no-weights build must hold, got %s", resp.Decision)
	}
	if !resp.EscalateForDeeperReview {
		t.Fatalf("no-weights build must escalate")
	}
	found := false
	for _, f := range resp.PolicyFindings {
		if f == "model_weights_not_loaded" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected model_weights_not_loaded finding, got %v", resp.PolicyFindings)
	}
}

func TestSetWeightsValidatesShape(t *testing.T) {
	resetWeights()
	if err := SetWeights(Weights{}); err == nil {
		t.Fatalf("expected shape validation error for empty weights")
	}
	if err := SetWeights(syntheticWeights()); err != nil {
		t.Fatalf("valid-shaped weights should load: %v", err)
	}
	if !weightsLoaded() {
		t.Fatalf("weightsLoaded() should be true after SetWeights")
	}
}

func TestLoadWeightsJSON(t *testing.T) {
	resetWeights()
	b, err := json.Marshal(syntheticWeights())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := LoadWeights(bytes.NewReader(b)); err != nil {
		t.Fatalf("LoadWeights: %v", err)
	}
	if !weightsLoaded() {
		t.Fatalf("weights should be loaded after LoadWeights")
	}
}

func TestInferRunsForwardPassWithLoadedWeights(t *testing.T) {
	resetWeights()
	if err := SetWeights(syntheticWeights()); err != nil {
		t.Fatalf("load synthetic weights: %v", err)
	}
	// With all-zero synthetic weights the forward pass is well-defined: logits
	// are equal, softmax is uniform, decision falls to index 0. We assert only
	// runtime-shape invariants, not trained semantics.
	resp := Infer(Request{RequestID: "test-fp", Features: Features{EvidenceComplete: true}})
	if resp.Decision != Labels[0] && resp.Decision != Labels[1] {
		t.Fatalf("decision must be a valid label, got %q", resp.Decision)
	}
	if resp.Confidence < 0 || resp.Confidence > 1 {
		t.Fatalf("confidence out of range: %f", resp.Confidence)
	}
	if resp.Architecture != Architecture {
		t.Fatalf("architecture mismatch")
	}
}

func TestEncode(t *testing.T) {
	f := Features{PeoplePresent: true, VehiclesPresent: false, ObstaclesPresent: true, EvidenceComplete: true, OperatorReviewReqd: true, LatencyMeasured: true, ApprovalRefsComplete: false, DetectionCount: 10}
	enc := Encode(f)
	if enc[0] != 1.0 {
		t.Errorf("people_present: expected 1.0, got %f", enc[0])
	}
	if enc[2] != 1.0 {
		t.Errorf("obstacles_present: expected 1.0, got %f", enc[2])
	}
	if enc[6] != 0.0 {
		t.Errorf("approval_refs_complete: expected 0.0, got %f", enc[6])
	}
	if enc[7] != 0.5 {
		t.Errorf("detection_count_norm: expected 0.5, got %f", enc[7])
	}
}
