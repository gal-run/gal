// Package embeddings calls the gal-model sidecar (or a direct OpenAI /
// Voyage / Gemini fallback) to turn chunk text into dense vectors. Results
// are cached in-memory keyed by the chunk's content hash so re-ingestion
// of identical content is free.
package embeddings

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

// Named-vector slot constants. These match the keys used by the qdrant
// collection schema (see TECH.md §5.1.1) and the Upserter
// implementation in the qdrant package.
const (
	VectorOpenAI256  = "dense_openai_256"
	VectorVoyage512  = "dense_voyage_512"
	VectorSparseBM25 = "sparse_bm25"
)

// Model identifies which dense vector a request should produce.
type Model string

// Embedding config strings — keep in sync with TECH.md 5.1.2's
// `embeddingConfig` enum.
const (
	ModelOpenAITextSmall3_256  Model = "OPENAI_TEXT_SMALL_3_256"
	ModelVoyage3_5             Model = "VOYAGE_3_5"
	ModelVoyageCode3_512       Model = "VOYAGE_CODE_3_512"
	ModelVoyage35Lite_512      Model = "VOYAGE_3_5_LITE_512"
	ModelGeminiEmbedding001512 Model = "GEMINI_EMBEDDING_001_512" // gemini-embedding-001, 512-dim
)

// VectorName returns the Qdrant named-vector slot for the model.
func (m Model) VectorName() string {
	switch m {
	case ModelOpenAITextSmall3_256:
		return VectorOpenAI256
	default:
		// Voyage family all share the 512-dim slot.
		return VectorVoyage512
	}
}

// Dim returns the expected output dimensionality for the model.
func (m Model) Dim() int {
	switch m {
	case ModelOpenAITextSmall3_256:
		return 256
	case ModelVoyage3_5, ModelVoyageCode3_512, ModelVoyage35Lite_512,
		ModelGeminiEmbedding001512:
		return 512
	default:
		return 0
	}
}

// Result is the embedding client output for a single input.
type Result struct {
	Vector []float32
	Tokens int
}

// Client is a thread-safe embedding client.
type Client struct {
	galModelURL string
	openAIKey   string
	voyageKey   string
	googleAIKey string
	httpClient  *http.Client

	cache sync.Map // map[cacheKey][]float32
	dim   sync.Map // map[Model]int
}

type cacheKey struct {
	hash  string
	model Model
}

// New constructs a Client. Connection details come from env vars:
//
//	GAL_MODEL_URL    — gal-model sidecar base URL (e.g. http://localhost:9000)
//	OPENAI_API_KEY   — used when gal-model is unavailable
//	VOYAGE_API_KEY   — ditto
//	GOOGLE_AI_API_KEY — Gemini embedding API (gemini-embedding-001, 512-dim)
//
// If GAL_MODEL_URL is empty, the client falls back to direct provider
// APIs in order: OpenAI → Voyage → Google AI. The gal-model route is
// preferred when available (TECH.md §4).
func New() *Client {
	return &Client{
		galModelURL: os.Getenv("GAL_MODEL_URL"),
		openAIKey:   os.Getenv("OPENAI_API_KEY"),
		voyageKey:   os.Getenv("VOYAGE_API_KEY"),
		googleAIKey: os.Getenv("GOOGLE_AI_API_KEY"),
		httpClient:  &http.Client{Timeout: 30 * time.Second},
	}
}

// Embed returns embeddings for the given inputs using `model`.
// The returned slice is parallel to `inputs`. The cache is checked
// per-input; cached results skip the network call.
func (c *Client) Embed(ctx context.Context, inputs []string, model Model) ([]Result, error) {
	expected := model.Dim()
	if expected == 0 {
		return nil, fmt.Errorf("embeddings: unknown model %q", model)
	}
	out := make([]Result, len(inputs))

	// Cache lookup.
	missing := make([]int, 0, len(inputs))
	for i, s := range inputs {
		key := cacheKey{hash: contentHash(s), model: model}
		if v, ok := c.cache.Load(key); ok {
			out[i] = v.(Result)
			continue
		}
		missing = append(missing, i)
	}
	if len(missing) == 0 {
		return out, nil
	}

	// Call the embedding backend.
	missingTexts := make([]string, len(missing))
	for k, idx := range missing {
		missingTexts[k] = inputs[idx]
	}
	raw, err := c.callBackend(ctx, missingTexts, model)
	if err != nil {
		return nil, err
	}
	if len(raw) != len(missing) {
		return nil, fmt.Errorf("embeddings: backend returned %d results for %d inputs", len(raw), len(missing))
	}
	for k, idx := range missing {
		r := raw[k]
		if len(r.Vector) != expected {
			return nil, fmt.Errorf("embeddings: backend returned dim %d, expected %d for %s", len(r.Vector), expected, model)
		}
		out[idx] = r
		c.cache.Store(cacheKey{hash: contentHash(inputs[idx]), model: model}, r)
	}
	return out, nil
}

// callBackend dispatches to gal-model when configured, else to a direct
// provider API. The gal-model route is the primary path; the direct
// providers are a fallback for local dev where the sidecar is offline.
func (c *Client) callBackend(ctx context.Context, inputs []string, model Model) ([]Result, error) {
	if c.galModelURL != "" {
		res, err := c.callGalModel(ctx, inputs, model)
		if err == nil {
			return res, nil
		}
		// If gal-model is unreachable, fall through to direct providers.
		// We log the failure via the error but try the next backend.
	}

	switch model {
	case ModelOpenAITextSmall3_256:
		return c.callOpenAI(ctx, inputs, "text-embedding-3-small", 256)
	case ModelVoyage3_5:
		return c.callVoyage(ctx, inputs, "voyage-3.5", 512)
	case ModelVoyageCode3_512:
		return c.callVoyage(ctx, inputs, "voyage-code-3", 512)
	case ModelVoyage35Lite_512:
		return c.callVoyage(ctx, inputs, "voyage-3.5-lite", 512)
	case ModelGeminiEmbedding001512:
		return c.callGoogleAI(ctx, inputs, "gemini-embedding-001", 512)
	default:
		return nil, fmt.Errorf("embeddings: no backend for model %q", model)
	}
}

// gal-model request/response shapes.
type galModelReq struct {
	Model   string   `json:"model"`
	Inputs  []string `json:"inputs"`
	Truncate bool   `json:"truncate"`
}
type galModelResp struct {
	Embeddings []galModelEmb `json:"embeddings"`
}
type galModelEmb struct {
	Vector []float32 `json:"vector"`
	Tokens int       `json:"tokens"`
}

func (c *Client) callGalModel(ctx context.Context, inputs []string, model Model) ([]Result, error) {
	body, _ := json.Marshal(galModelReq{
		Model: string(model), Inputs: inputs, Truncate: true,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", c.galModelURL+"/embed", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("gal-model %d: %s", resp.StatusCode, string(buf))
	}
	var out galModelResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	res := make([]Result, len(out.Embeddings))
	for i, e := range out.Embeddings {
		res[i] = Result{Vector: e.Vector, Tokens: e.Tokens}
	}
	return res, nil
}

type openAIReq struct {
	Input []string `json:"input"`
	Model string   `json:"model"`
	Dimensions int  `json:"dimensions,omitempty"`
}
type openAIResp struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
		Index     int       `json:"index"`
	} `json:"data"`
	Usage struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage"`
}

func (c *Client) callOpenAI(ctx context.Context, inputs []string, model string, dim int) ([]Result, error) {
	if c.openAIKey == "" {
		return nil, fmt.Errorf("embeddings: OPENAI_API_KEY not set")
	}
	body, _ := json.Marshal(openAIReq{Input: inputs, Model: model, Dimensions: dim})
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/embeddings", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+c.openAIKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("openai %d: %s", resp.StatusCode, string(buf))
	}
	var out openAIResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	perInput := out.Usage.TotalTokens / maxInt(1, len(inputs))
	res := make([]Result, len(out.Data))
	for i, d := range out.Data {
		res[i] = Result{Vector: d.Embedding, Tokens: perInput}
	}
	return res, nil
}

type voyageReq struct {
	Input []string `json:"input"`
	Model string   `json:"model"`
}
type voyageResp struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
		Index     int       `json:"index"`
	} `json:"data"`
	Usage struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage"`
}

func (c *Client) callVoyage(ctx context.Context, inputs []string, model string, _ int) ([]Result, error) {
	if c.voyageKey == "" {
		return nil, fmt.Errorf("embeddings: VOYAGE_API_KEY not set")
	}
	body, _ := json.Marshal(voyageReq{Input: inputs, Model: model})
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://api.voyageai.com/v1/embeddings", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+c.voyageKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("voyage %d: %s", resp.StatusCode, string(buf))
	}
	var out voyageResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	perInput := out.Usage.TotalTokens / maxInt(1, len(inputs))
	res := make([]Result, len(out.Data))
	for i, d := range out.Data {
		res[i] = Result{Vector: d.Embedding, Tokens: perInput}
	}
	return res, nil
}

// Google AI batchEmbedContents request/response shapes.
type googleAIBatchReq struct {
	Requests []googleAIEmbedReq `json:"requests"`
}
type googleAIEmbedReq struct {
	Model              string         `json:"model"`
	Content            googleAIContent `json:"content"`
	OutputDimensionality int          `json:"outputDimensionality,omitempty"`
}
type googleAIContent struct {
	Parts []googleAIPart `json:"parts"`
}
type googleAIPart struct {
	Text string `json:"text"`
}
type googleAIBatchResp struct {
	Embeddings []struct {
		Values []float32 `json:"values"`
	} `json:"embeddings"`
}

func (c *Client) callGoogleAI(ctx context.Context, inputs []string, modelName string, dim int) ([]Result, error) {
	if c.googleAIKey == "" {
		return nil, fmt.Errorf("embeddings: GOOGLE_AI_API_KEY not set")
	}
	reqs := make([]googleAIEmbedReq, len(inputs))
	for i, text := range inputs {
		reqs[i] = googleAIEmbedReq{
			Model:                "models/" + modelName,
			Content:              googleAIContent{Parts: []googleAIPart{{Text: text}}},
			OutputDimensionality: dim,
		}
	}
	body, _ := json.Marshal(googleAIBatchReq{Requests: reqs})
	url := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:batchEmbedContents?key=%s",
		modelName, c.googleAIKey,
	)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("google-ai embed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("google-ai %d: %s", resp.StatusCode, string(buf))
	}
	var out googleAIBatchResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if len(out.Embeddings) != len(inputs) {
		return nil, fmt.Errorf("embeddings: google-ai returned %d for %d inputs", len(out.Embeddings), len(inputs))
	}
	res := make([]Result, len(out.Embeddings))
	for i, e := range out.Embeddings {
		res[i] = Result{Vector: e.Values}
	}
	return res, nil
}

func contentHash(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
