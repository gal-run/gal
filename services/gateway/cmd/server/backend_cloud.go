//go:build cloud
// +build cloud

package main

import (
	"context"

	"github.com/gal-run/gal/services/lib/firestore"
)

// verifyBackend checks Firestore connectivity in the cloud build (SEAM 2).
func verifyBackend(ctx context.Context) error {
	_, err := firestore.Client(ctx)
	return err
}

// closeBackend releases the Firestore client on shutdown (cloud build).
func closeBackend() { firestore.Close() }
