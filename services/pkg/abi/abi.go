// Package abi is the cgo binding to the frozen kernel ABI
// (kernel/include/gal_decide.h). It is the ONE place Go links the
// C reference monitor; every Go service decides through here.
//
// An ABI header change is the single intentional cross-language fan-out:
// ci.yml (services job) rebuilds this cgo package when kernel/include/**
// changes.
//
// State: this is the binding STUB. It includes the head ABI header and reads
// the compile-time version macros, so it compiles against kernel/include/ as
// shipped. It does NOT yet link libgal_decide (the runtime call
// gal_abi_version() and gal_decide() land when the kernel lib is built+linked
// in CI) — full cgo+lib unification is a deliberate later step, so the LDFLAGS
// link line is kept commented to avoid a link against a not-yet-built archive.
//
// License: Apache-2.0 (outside any ee/ directory).
package abi

/*
#cgo CFLAGS: -I${SRCDIR}/../../../kernel/include
// #cgo LDFLAGS: -L${SRCDIR}/../../../kernel -lgal_decide  // enabled at lib unification
#include "gal_decide.h"
*/
import "C"

// Version returns the kernel ABI version as (major<<16)|minor.
//
// Bound to the head header's compile-time macros (GAL_ABI_VERSION_MAJOR/MINOR)
// so the value tracks the ABI the cgo package was compiled against. The
// runtime symbol gal_abi_version() is wired once libgal_decide is linked:
//
//	return uint32(C.gal_abi_version())
func Version() uint32 {
	return (uint32(C.GAL_ABI_VERSION_MAJOR) << 16) | uint32(C.GAL_ABI_VERSION_MINOR)
}
