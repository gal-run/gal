//go:build cloud
// +build cloud

// Package store provides Firestore-backed storage for MCP gateway data.
package store

import (
	"context"

	cfs "cloud.google.com/go/firestore"

	"github.com/gal-run/gal/services/lib/firestore"
	"github.com/gal-run/gal/services/mcp-gateway/internal/domain"
)

// McpStore provides Firestore-backed CRUD for MCP tokens, clients, and feature flags.
type McpStore struct {
	store *firestore.ServiceStore
}

// NewMcpStore creates a new McpStore with collection mappings.
func NewMcpStore(fsClient *cfs.Client) *McpStore {
	return &McpStore{
		store: firestore.NewServiceStore(fsClient, map[string]string{
			"tokens":       "mcp_tokens",
			"clients":      "mcp_clients",
			"featureFlags": "feature_flags",
		}),
	}
}

// Collection returns a Firestore collection reference by logical name.
func (s *McpStore) Collection(name string) *cfs.CollectionRef {
	return s.store.Collection(name)
}

// ---------------------------------------------------------------------------
// Token operations
// ---------------------------------------------------------------------------

// SaveToken persists an MCP token document.
func (s *McpStore) SaveToken(ctx context.Context, token *domain.McpToken) error {
	_, err := s.store.Doc("tokens", token.ID).Set(ctx, token)
	return err
}

// GetToken retrieves an MCP token by its document ID.
func (s *McpStore) GetToken(ctx context.Context, id string) (*domain.McpToken, error) {
	doc, err := s.store.Doc("tokens", id).Get(ctx)
	if err != nil {
		return nil, err
	}
	var token domain.McpToken
	if err := doc.DataTo(&token); err != nil {
		return nil, err
	}
	return &token, nil
}

// GetTokenByValue looks up an MCP token by its bearer token string.
func (s *McpStore) GetTokenByValue(ctx context.Context, tokenValue string) (*domain.McpToken, error) {
	iter := s.store.Collection("tokens").Where("token", "==", tokenValue).Limit(1).Documents(ctx)
	doc, err := iter.Next()
	if err != nil {
		return nil, err
	}
	var token domain.McpToken
	if err := doc.DataTo(&token); err != nil {
		return nil, err
	}
	return &token, nil
}

// RevokeToken marks a token as revoked.
func (s *McpStore) RevokeToken(ctx context.Context, id string) error {
	token, err := s.GetToken(ctx, id)
	if err != nil {
		return err
	}
	token.Revoked = true
	_, err = s.store.Doc("tokens", id).Set(ctx, token)
	return err
}

// RevokeTokenByValue marks a token as revoked by its bearer token value.
func (s *McpStore) RevokeTokenByValue(ctx context.Context, tokenValue string) error {
	token, err := s.GetTokenByValue(ctx, tokenValue)
	if err != nil {
		return err
	}
	return s.RevokeToken(ctx, token.ID)
}

// GetTokenByRefresh looks up a token by its refresh token value.
func (s *McpStore) GetTokenByRefresh(ctx context.Context, refreshToken string) (*domain.McpToken, error) {
	iter := s.store.Collection("tokens").Where("refreshToken", "==", refreshToken).Limit(1).Documents(ctx)
	doc, err := iter.Next()
	if err != nil {
		return nil, err
	}
	var token domain.McpToken
	if err := doc.DataTo(&token); err != nil {
		return nil, err
	}
	return &token, nil
}

// ---------------------------------------------------------------------------
// Client operations
// ---------------------------------------------------------------------------

// SaveClient persists an MCP client registration.
func (s *McpStore) SaveClient(ctx context.Context, client *domain.McpClient) error {
	_, err := s.store.Doc("clients", client.ID).Set(ctx, client)
	return err
}

// GetClient retrieves an MCP client by ID.
func (s *McpStore) GetClient(ctx context.Context, id string) (*domain.McpClient, error) {
	doc, err := s.store.Doc("clients", id).Get(ctx)
	if err != nil {
		return nil, err
	}
	var client domain.McpClient
	if err := doc.DataTo(&client); err != nil {
		return nil, err
	}
	return &client, nil
}

// DeleteClient removes a client registration (e.g., expired dynamic clients).
func (s *McpStore) DeleteClient(ctx context.Context, id string) error {
	_, err := s.store.Doc("clients", id).Delete(ctx)
	return err
}

// ---------------------------------------------------------------------------
// Generic document read/write for flexible metadata storage
// ---------------------------------------------------------------------------

// SaveDoc writes an arbitrary value to a logical collection/doc pair.
func (s *McpStore) SaveDoc(ctx context.Context, collection, docID string, data any) error {
	_, err := s.store.Doc(collection, docID).Set(ctx, data)
	return err
}

// GetDoc reads an arbitrary document into the provided value.
func (s *McpStore) GetDoc(ctx context.Context, collection, docID string, dest any) error {
	doc, err := s.store.Doc(collection, docID).Get(ctx)
	if err != nil {
		return err
	}
	return doc.DataTo(dest)
}

// DeleteDoc removes a document from a logical collection.
func (s *McpStore) DeleteDoc(ctx context.Context, collection, docID string) error {
	_, err := s.store.Doc(collection, docID).Delete(ctx)
	return err
}

// ---------------------------------------------------------------------------
// Feature flag operations
// ---------------------------------------------------------------------------

// GetFeatureFlag retrieves a feature flag by key.
func (s *McpStore) GetFeatureFlag(ctx context.Context, key string) (*domain.FeatureFlag, error) {
	doc, err := s.store.Doc("featureFlags", key).Get(ctx)
	if err != nil {
		return nil, err
	}
	var flag domain.FeatureFlag
	if err := doc.DataTo(&flag); err != nil {
		return nil, err
	}
	return &flag, nil
}

// ListFeatureFlags retrieves all feature flags.
func (s *McpStore) ListFeatureFlags(ctx context.Context) ([]domain.FeatureFlag, error) {
	iter := s.store.Collection("featureFlags").Documents(ctx)
	var flags []domain.FeatureFlag
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var flag domain.FeatureFlag
		if err := doc.DataTo(&flag); err != nil {
			continue
		}
		flags = append(flags, flag)
	}
	return flags, nil
}
