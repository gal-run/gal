// Package ingest owns the goroutine pool that drains gal_rag_jobs and
// pushes the resulting chunks into the vector store. Non-GitHub sources
// (memory entries, ADRs, agent learnings) call Enqueue to schedule
// work directly.
package ingest

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
	"github.com/gal-run/gal/services/gal-rag/internal/store"
	"github.com/google/uuid"
)

// EnqueueRequest is the input for Enqueue. All fields are required
// except Content, which may be empty for `kind=delete`.
type EnqueueRequest struct {
	OrgID           string
	RepoScope       string
	SourceKind      string // github_file | github_issue | github_pr | memory_entry | adr
	SourceType      string // go | rust | ts | py | md | issue | pr | adr | memory
	Owner           string
	Repo            string
	Path            string
	Ref             string
	URL             string
	Content         string
	EmbeddingConfig string // defaults to VOYAGE_CODE_3_512
	Force           bool
	// InstallationID is the GitHub App installation id, persisted on the
	// SourceRef so the worker can fetch content for empty-Content jobs.
	InstallationID int64
}

// Enqueue schedules an ingestion job. The returned jobUuid can be used
// to track the job or look it up in the DLQ if it ultimately fails.
func Enqueue(ctx context.Context, s *store.Store, req EnqueueRequest) (string, error) {
	if req.OrgID == "" {
		return "", fmt.Errorf("ingest.Enqueue: orgId is required")
	}
	if req.SourceKind == "" {
		return "", fmt.Errorf("ingest.Enqueue: sourceKind is required")
	}
	if req.SourceType == "" {
		req.SourceType = inferSourceType(req.SourceKind, req.Path)
	}

	ref := contracts.SourceRef{
		Kind:           contracts.SourceRefKind(req.SourceKind),
		Owner:          req.Owner,
		Repo:           req.Repo,
		Path:           req.Path,
		Ref:            req.Ref,
		URL:            req.URL,
		InstallationID: req.InstallationID,
	}
	if ref.URL == "" {
		ref.URL = BuildCanonicalURL(ref)
	}
	refBytes, err := json.Marshal(ref)
	if err != nil {
		return "", fmt.Errorf("ingest.Enqueue: marshal sourceRef: %w", err)
	}

	contentHash := ContentHash(req.OrgID, req.RepoScope, req.Path, 0, len(req.Content), req.Content)

	// Force=true bypasses job-level dedup: use a fresh random UUID so the
	// ON CONFLICT path in store.Enqueue always inserts a new row.
	var jobUUID string
	if req.Force {
		jobUUID = uuid.NewString()
	}

	job := store.Job{
		JobUUID:         jobUUID,
		OrgID:           req.OrgID,
		RepoScope:       req.RepoScope,
		SourceKind:      req.SourceKind,
		SourceType:      req.SourceType,
		SourceRef:       refBytes,
		Content:         req.Content,
		ContentHash:     contentHash,
		EmbeddingConfig: req.EmbeddingConfig,
		Force:           req.Force,
		Status:          "pending",
	}
	return s.Enqueue(ctx, job)
}

// ContentHash is the canonical content-hash function. It matches the
// formula in TECH.md §6.3:
//
//	sha256(orgId|repoScope|path|byteStart|byteEnd|contentHash)
//
// where `contentHash` is sha256(content). The pipe is the literal byte.
// The result is prefixed with "sha256:" for readability in logs and
// dedup lookups.
func ContentHash(orgID, repoScope, path string, byteStart, byteEnd int, content string) string {
	inner := sha256.Sum256([]byte(content))
	innerHex := hex.EncodeToString(inner[:])
	pre := fmt.Sprintf("%s|%s|%s|%d|%d|%s", orgID, repoScope, path, byteStart, byteEnd, innerHex)
	h := sha256.Sum256([]byte(pre))
	return "sha256:" + hex.EncodeToString(h[:])
}

// BuildCanonicalURL returns a stable github.com URL for a source ref,
// or an empty string if the kind doesn't have a URL form.
func BuildCanonicalURL(ref contracts.SourceRef) string {
	switch ref.Kind {
	case contracts.SourceRefGitHubFile:
		if ref.Owner == "" || ref.Repo == "" {
			return ""
		}
		base := fmt.Sprintf("https://github.com/%s/%s/blob/%s/%s",
			ref.Owner, ref.Repo, ref.Ref, strings.TrimPrefix(ref.Path, "/"))
		return base
	case contracts.SourceRefGitHubIssue:
		if ref.Owner == "" || ref.Repo == "" {
			return ""
		}
		return fmt.Sprintf("https://github.com/%s/%s/issues/%s", ref.Owner, ref.Repo, ref.Ref)
	case contracts.SourceRefGitHubPR:
		if ref.Owner == "" || ref.Repo == "" {
			return ""
		}
		return fmt.Sprintf("https://github.com/%s/%s/pull/%s", ref.Owner, ref.Repo, ref.Ref)
	default:
		return ref.URL
	}
}

// inferSourceType picks a default sourceType from the file extension or
// the source kind. Mirrors the enum in TECH.md §5.1.2.
func inferSourceType(kind, path string) string {
	switch kind {
	case "github_issue":
		return "issue"
	case "github_pr":
		return "pr"
	case "memory_entry":
		return "memory"
	case "adr":
		return "adr"
	}
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".go":
		return "go"
	case ".rs":
		return "rust"
	case ".ts", ".tsx":
		return "ts"
	case ".js", ".jsx":
		return "ts"
	case ".py":
		return "py"
	case ".md", ".markdown":
		return "md"
	default:
		return "md"
	}
}
