//go:build !cloud
// +build !cloud

package main

import (
	"context"
	"errors"

	"github.com/gal-run/gal/services/governance-svc/internal/store"
)

// newFirestoreStore is the OSS stub (SEAM 3): the Firestore backend ships only
// in the `cloud` build. Self-hosted/OSS deployments must select the Postgres
// backend (GOV_STORE=postgres). This returns an error rather than linking the
// Google Cloud SDK, keeping the OSS binary GCP-free.
func newFirestoreStore(ctx context.Context) (store.Store, error) {
	return nil, errors.New("firestore backend is only available in the `cloud` build; set GOV_STORE=postgres")
}
