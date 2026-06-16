// Command auth is one binary in the gal services surface.
// Built with: go build ./cmd/auth  (OSS: -tags oss drops ee/ paths).
//
// License: Apache-2.0 (outside any ee/ directory).
package main

import (
	"fmt"

	"github.com/gal-run/gal/services/pkg/abi"
)

func main() {
	fmt.Printf("auth: gal service skeleton (kernel ABI v%d.%d)\n",
		abi.Version()>>16, abi.Version()&0xffff)
}
