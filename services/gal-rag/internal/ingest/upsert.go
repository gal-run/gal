package ingest

import (
	"context"
	"sync"
)

// NoopUpserter is a placeholder Upserter that records calls in memory
// without writing to a vector store. It's used in main.go until a
// production Upserter (gRPC / HTTP) is wired in. Tests can also use
// it to verify the worker pool plumbing without a live Qdrant.
type NoopUpserter struct {
	mu     sync.Mutex
	Points []*Point
}

// Upsert records the points and returns nil.
func (u *NoopUpserter) Upsert(_ context.Context, points []*Point) error {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.Points = append(u.Points, points...)
	return nil
}

// ExistsByContentHash always returns false (no dedup in the noop).
func (u *NoopUpserter) ExistsByContentHash(_ context.Context, _, _ string) (bool, error) {
	return false, nil
}

// DeleteByContentHash is a no-op.
func (u *NoopUpserter) DeleteByContentHash(_ context.Context, _, _ string) error {
	return nil
}

// Snapshot returns a copy of the recorded points for inspection in tests.
func (u *NoopUpserter) Snapshot() []*Point {
	u.mu.Lock()
	defer u.mu.Unlock()
	out := make([]*Point, len(u.Points))
	copy(out, u.Points)
	return out
}

// Reset clears the recorded points.
func (u *NoopUpserter) Reset() {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.Points = nil
}
