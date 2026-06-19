// Package gal — OSS weight placeholder.
//
// This file deliberately ships NO trained model weights. The GAL governance
// model is an 8->24->24->2 MLP; the pure-Go forward pass (dense/relu/softmax
// in model.go) is the OSS math runtime. The trained weights/biases are a
// proprietary artifact (gal-model) and are NOT distributed with the OSS tree.
//
// The weight tensors below are empty by default. A deployment supplies real
// weights at runtime via LoadWeights (e.g. from a JSON file pointed to by
// GAL_WEIGHTS_PATH, or any other loader the host wires up). Until weights are
// loaded, Infer fails safe (see model.go: weightsLoaded()).
//
// Shapes, for reference (filled in at load time):
//
//	weightsL0W: [24][8]float64   weightsL0B: [24]float64   // layer 0: 8->24
//	weightsL2W: [24][24]float64  weightsL2B: [24]float64   // layer 2: 24->24
//	weightsL4W: [2][24]float64   weightsL4B: [2]float64    // layer 4: 24->2
package gal

import (
	"encoding/json"
	"fmt"
	"io"
)

// Model weight tensors. Empty in the OSS distribution; populated at runtime by
// LoadWeights. No trained values are embedded here.
var (
	weightsL0W [][]float64
	weightsL0B []float64
	weightsL2W [][]float64
	weightsL2B []float64
	weightsL4W [][]float64
	weightsL4B []float64
)

// Weights is the on-disk shape of the model parameters, used by LoadWeights to
// populate the runtime tensors. The OSS tree ships the loader and the math;
// the host supplies the values.
type Weights struct {
	L0W [][]float64 `json:"l0_w"`
	L0B []float64   `json:"l0_b"`
	L2W [][]float64 `json:"l2_w"`
	L2B []float64   `json:"l2_b"`
	L4W [][]float64 `json:"l4_w"`
	L4B []float64   `json:"l4_b"`
}

// weightsLoaded reports whether real model weights have been supplied at
// runtime. Infer fail-safes (holds for operator review) when this is false so
// that a weight-less OSS build never silently "clears" anything.
func weightsLoaded() bool {
	return len(weightsL0W) > 0 && len(weightsL2W) > 0 && len(weightsL4W) > 0
}

// SetWeights installs model parameters at runtime. It performs basic shape
// validation against the fixed 8->24->24->2 architecture.
func SetWeights(w Weights) error {
	if len(w.L0W) != 24 || len(w.L0B) != 24 {
		return fmt.Errorf("gal: layer 0 expects [24][8] weights + [24] bias, got [%d][?]+[%d]", len(w.L0W), len(w.L0B))
	}
	if len(w.L2W) != 24 || len(w.L2B) != 24 {
		return fmt.Errorf("gal: layer 2 expects [24][24] weights + [24] bias, got [%d][?]+[%d]", len(w.L2W), len(w.L2B))
	}
	if len(w.L4W) != 2 || len(w.L4B) != 2 {
		return fmt.Errorf("gal: layer 4 expects [2][24] weights + [2] bias, got [%d][?]+[%d]", len(w.L4W), len(w.L4B))
	}
	weightsL0W, weightsL0B = w.L0W, w.L0B
	weightsL2W, weightsL2B = w.L2W, w.L2B
	weightsL4W, weightsL4B = w.L4W, w.L4B
	return nil
}

// LoadWeights reads JSON-encoded model parameters from r and installs them via
// SetWeights. This is the OSS runtime weight-loading path; the trained values
// themselves are not part of this repository.
func LoadWeights(r io.Reader) error {
	var w Weights
	if err := json.NewDecoder(r).Decode(&w); err != nil {
		return fmt.Errorf("gal: decode weights: %w", err)
	}
	return SetWeights(w)
}
