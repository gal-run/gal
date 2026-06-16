// GAL Enterprise Edition - Commercial License (LICENSE.ee / ee/LICENSE).
// Copyright 2026 Scheduler Systems Ltd. All rights reserved.
// NOT Apache-2.0. See docs/EE.md. Inert without a valid signed license key.
//
//go:build !oss

// Package ee holds commercial governance capabilities for the governance
// service. It is compiled OUT of OSS builds (-tags oss) so published OSS
// artifacts contain zero commercial code, and is runtime-inert without a
// valid license key (kernel capability GAL_CAP_EE_FEATURE).
package ee

// AdvancedPolicyEnabled reports whether the licensed advanced-policy engine
// is active. Real implementations gate on the kernel license check; this
// skeleton stays inert.
func AdvancedPolicyEnabled() bool {
	// Wired to gal_license_allows(ctx, GAL_CAP_EE_FEATURE) via pkg/abi.
	return false
}
