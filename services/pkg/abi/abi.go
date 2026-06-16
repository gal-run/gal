// Package abi is the cgo binding to the frozen kernel ABI
// (kernel/include/gal/gal_decide.h). It is the ONE place Go links the
// C reference monitor; every Go service decides through here.
//
// An ABI header change is the single intentional cross-language fan-out:
// services.yml rebuilds this cgo package when kernel/include/** changes.
//
// License: Apache-2.0 (outside any ee/ directory).
package abi

/*
#cgo CFLAGS: -I${SRCDIR}/../../../kernel/include
#cgo LDFLAGS: -L${SRCDIR}/../../../kernel -lgal_decide
#include "gal/gal_decide.h"
*/
import "C"

// Version returns the kernel ABI version as (major<<16)|minor.
// Skeleton: real wiring lands with the build of libgal_decide.
func Version() uint32 {
	// Placeholder until the kernel lib is built+linked in CI.
	// return uint32(C.gal_abi_version())
	return (1 << 16) | 0
}
