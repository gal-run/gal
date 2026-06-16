//go:build !cloud
// +build !cloud

// Package githubapp (OSS stub). SEAM 3: the real GitHub App REST client lives
// in client.go behind `//go:build cloud`. This stub is compiled into the
// default OSS build so callers (gal-rag) still compile WITHOUT the hosted
// GitHub ingestion adapter. LoadKey returns ErrCloudOnly, and a stub *Client
// satisfies the same FetchFile/InstallationToken surface (returning
// ErrCloudOnly) so the OSS build's GitHub content fetch is simply disabled.
package githubapp

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// ErrCloudOnly is returned by LoadKey / Client methods in the OSS build: the
// GitHub App ingestion adapter ships only in the `cloud` build.
var ErrCloudOnly = errors.New("githubapp: GitHub App client is only available in the `cloud` build")

// ErrNotFound mirrors the cloud build's sentinel so callers' errors.Is checks
// compile and behave identically (a stub fetch never returns it).
var ErrNotFound = errors.New("githubapp: file not found (404)")

// ErrNoInstallation mirrors the cloud build's sentinel.
var ErrNoInstallation = errors.New("githubapp: missing installation id")

// RateLimitError mirrors the cloud build's type for callers that type-assert.
type RateLimitError struct {
	RetryAfter time.Duration
	Status     int
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("githubapp: rate limited (status %d, retry after %s)", e.Status, e.RetryAfter)
}

// AuthError mirrors the cloud build's type for callers that type-assert.
type AuthError struct {
	Status int
	Body   string
}

func (e *AuthError) Error() string {
	return fmt.Sprintf("githubapp: auth failed (status %d): %s", e.Status, e.Body)
}

// Client is the OSS stub. It carries no key/state and every operation reports
// ErrCloudOnly. It still satisfies the FileFetcher surface gal-rag expects.
type Client struct{}

// LoadKey is the OSS stub: it always fails with ErrCloudOnly so callers log a
// warning and disable GitHub content fetch (the documented "credentials
// absent" path), exactly as if the feature were not configured.
func LoadKey(pemData, appID string) (*Client, error) {
	return nil, ErrCloudOnly
}

// SetHTTPClient is a no-op in the OSS stub.
func (c *Client) SetHTTPClient(h *http.Client) {}

// SetAPIBase is a no-op in the OSS stub.
func (c *Client) SetAPIBase(base string) {}

// InstallationToken is unavailable in the OSS build.
func (c *Client) InstallationToken(ctx context.Context, installID int64) (string, error) {
	return "", ErrCloudOnly
}

// FetchFile is unavailable in the OSS build; satisfies ingest.FileFetcher.
func (c *Client) FetchFile(ctx context.Context, installID int64, owner, repo, path, ref string, maxBytes int64) ([]byte, string, error) {
	return nil, "", ErrCloudOnly
}
