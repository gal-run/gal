//go:build !cloud
// +build !cloud

// Package firestore (OSS stub). SEAM 3: the real Firestore wrapper + the
// cloud.google.com/go/firestore SDK live in store.go behind `//go:build cloud`.
// This stub is compiled into the default OSS build so packages that reference
// the firestore package symbols still compile WITHOUT linking the Google Cloud
// SDK. It deliberately does NOT expose the Firestore fluent API
// (Collection/Doc/RunTx) — those return GCP types, so any caller that uses them
// must itself be `//go:build cloud`. OSS persistence goes through the
// store.Store interface + the Postgres adapter (GOV_STORE=postgres).
package firestore

import (
	"context"
	"errors"
)

// ErrCloudOnly is returned by Client in the OSS build. A self-hosted (OSS)
// deployment must select a non-Firestore backend (e.g. GOV_STORE=postgres);
// the Firestore client is only available in the `cloud` build.
var ErrCloudOnly = errors.New("firestore: Google Cloud Firestore is only available in the `cloud` build (set GOV_STORE=postgres for self-hosted/OSS)")

// Client is the OSS stub. It never returns a live client: the OSS build links
// no Google Cloud SDK. Callers on the OSS boot path must gate on this error
// (or, preferably, not call it at all when GOV_STORE != firestore).
func Client(ctx context.Context) (*Client_, error) {
	return nil, ErrCloudOnly
}

// Client_ is an opaque placeholder so the `*firestore.Client_` return type
// resolves in the OSS build. It has no methods; the OSS path never holds one.
type Client_ struct{}

// ServiceStore is an opaque placeholder in the OSS build. The cloud build's
// ServiceStore carries the collection-scoped Firestore fluent API. The OSS
// stub intentionally has no fluent methods, so handler code that uses the
// Firestore API will not compile unless it is `//go:build cloud`.
type ServiceStore struct{}

// NewServiceStore is the OSS stub. The cloud build's signature takes a real
// *firestore.Client; the OSS stub takes the opaque placeholder so cloud-free
// boot/companion code can reference the symbol.
func NewServiceStore(client *Client_, collections map[string]string) *ServiceStore {
	return &ServiceStore{}
}

// Close is a no-op in the OSS build (no client to close).
func Close() error { return nil }
