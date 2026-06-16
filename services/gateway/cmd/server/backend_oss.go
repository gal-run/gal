//go:build !cloud
// +build !cloud

package main

import "context"

// verifyBackend is a no-op in the OSS build (SEAM 2): the gateway is a
// stateless reverse proxy that owns no Firestore data, so it boots and serves
// without any Google Cloud dependency. Downstream services own their own
// backend health (surfaced via /metrics).
func verifyBackend(ctx context.Context) error { return nil }

// closeBackend is a no-op in the OSS build (no Firestore client to close).
func closeBackend() {}
