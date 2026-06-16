// Package governance is the OSS governance service surface. Commercial
// capabilities live under ./ee (compiled out in OSS builds). No file outside
// ee/ may import an ee/ symbol in the OSS build (enforced by fence.yml).
//
// License: Apache-2.0 (outside any ee/ directory).
package governance

// Name identifies this service.
const Name = "governance"
