package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gal-run/gal/services/pkg/gal"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"golang.org/x/time/rate"
)

// ----------------------------------------------------------------
// GAL inference service — GPU-backed proprietary model API.
// ----------------------------------------------------------------

const (
	serviceName   = "gal-inference"
	modelRef      = "gal-model://gal/v1.2"
	architecture  = "mlp"
	defaultPort   = "8080"
	billingPrefix = "gal-inference"
)

var (
	apiKey     = os.Getenv("GAL_API_KEY")
	billingURL = os.Getenv("BILLING_URL")
)

// ----------------------------------------------------------------
// Request / Response
// ----------------------------------------------------------------

type InferRequest struct {
	RequestID   string   `json:"request_id,omitempty"`
	APIKey      string   `json:"api_key"`
	Application string   `json:"application"`
	Features    Features `json:"features"`
}

type Features struct {
	PeoplePresent        bool `json:"people_present"`
	VehiclesPresent      bool `json:"vehicles_present"`
	ObstaclesPresent     bool `json:"obstacles_present"`
	EvidenceComplete     bool `json:"evidence_complete"`
	OperatorReviewReqd   bool `json:"operator_review_required"`
	LatencyMeasured      bool `json:"latency_measured"`
	ApprovalRefsComplete bool `json:"approval_refs_complete"`
	DetectionCount       int  `json:"detection_count"`
}

type InferResponse struct {
	SchemaRef               string  `json:"schema_ref"`
	RequestID               string  `json:"request_id"`
	ModelRef                string  `json:"model_ref"`
	Architecture            string  `json:"architecture"`
	Decision                string  `json:"decision"`
	Confidence              float64 `json:"confidence"`
	CalibrationBucket       string  `json:"calibration_bucket"`
	LatencyMicros           int64   `json:"latency_micros"`
	EscalateForDeeperReview bool    `json:"escalate_for_deeper_review"`
	AdvisoryOnly            bool    `json:"advisory_only"`
	PhysicalActionAllowed   bool    `json:"physical_action_allowed"`
	HardwareCommandsIssued  bool    `json:"hardware_commands_issued"`
}

// ----------------------------------------------------------------
// Rate limiting per API key
// ----------------------------------------------------------------

type keyLimiter struct {
	mu       sync.Mutex
	limiters map[string]*rate.Limiter
}

func newKeyLimiter() *keyLimiter {
	return &keyLimiter{limiters: make(map[string]*rate.Limiter)}
}

func (kl *keyLimiter) get(key string) *rate.Limiter {
	kl.mu.Lock()
	defer kl.mu.Unlock()
	l, ok := kl.limiters[key]
	if !ok {
		l = rate.NewLimiter(rate.Limit(100), 200)
		kl.limiters[key] = l
	}
	return l
}

var rateLimiters = newKeyLimiter()

// ----------------------------------------------------------------
// Billing: record usage
// ----------------------------------------------------------------

func recordUsage(key, application string, latencyUs int64) {
	if billingURL == "" {
		return
	}
	go func() {
		body, _ := json.Marshal(map[string]any{
			"service":    billingPrefix,
			"api_key":    key,
			"app":        application,
			"model":      modelRef,
			"latency_us": latencyUs,
			"timestamp":  time.Now().Unix(),
		})
		http.Post(billingURL+"/usage", "application/json", bytes.NewReader(body))
	}()
}

// ----------------------------------------------------------------
// Inference
// ----------------------------------------------------------------

func inferFeatures(f Features) (string, float64, string) {
	req := gal.Request{
		RequestID:   fmt.Sprintf("%d", time.Now().UnixNano()),
		Application: "gal-inference",
		ModelRef:    modelRef,
		EvidenceRef: "gal://inference-svc",
		Features: gal.Features{
			PeoplePresent:        f.PeoplePresent,
			VehiclesPresent:      f.VehiclesPresent,
			ObstaclesPresent:     f.ObstaclesPresent,
			EvidenceComplete:     f.EvidenceComplete,
			OperatorReviewReqd:   f.OperatorReviewReqd,
			LatencyMeasured:      f.LatencyMeasured,
			ApprovalRefsComplete: f.ApprovalRefsComplete,
			DetectionCount:       f.DetectionCount,
		},
	}
	resp := gal.Infer(req)
	return resp.Decision, resp.Confidence, resp.CalibrationBucket
}

// ----------------------------------------------------------------
// Handlers
// ----------------------------------------------------------------

func handleInfer(w http.ResponseWriter, r *http.Request) {
	var req InferRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"read body"}`, http.StatusBadRequest)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if apiKey != "" && (req.APIKey == "" || req.APIKey != apiKey) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "invalid or missing api_key"})
		return
	}

	if !rateLimiters.get(req.APIKey).Allow() {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
		return
	}

	start := time.Now()
	decision, confidence, bucket := inferFeatures(req.Features)
	latencyUs := time.Since(start).Microseconds()

	recordUsage(obfuscate(req.APIKey), req.Application, latencyUs)

	resp := InferResponse{
		SchemaRef:               "https://gal.run/schemas/inference/v1",
		RequestID:               req.RequestID,
		ModelRef:                modelRef,
		Architecture:            architecture,
		Decision:                decision,
		Confidence:              confidence,
		CalibrationBucket:       bucket,
		LatencyMicros:           latencyUs,
		EscalateForDeeperReview: decision == "hold_for_operator_review" || confidence < 0.75,
		AdvisoryOnly:            true,
		PhysicalActionAllowed:   false,
		HardwareCommandsIssued:  false,
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "healthy",
		"model":   modelRef,
		"service": serviceName,
	})
}

func handleVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"model":        modelRef,
		"architecture": architecture,
		"service":      serviceName,
		"license":      "proprietary",
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func obfuscate(s string) string {
	if len(s) > 8 {
		return s[:4] + "..."
	}
	return s
}

// ----------------------------------------------------------------
// Main
// ----------------------------------------------------------------

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "X-API-Key"},
	}))

	r.Get("/health", handleHealth)
	r.Get("/version", handleVersion)
	r.Post("/v1/infer", handleInfer)

	log.Printf("%s %s starting on :%s", serviceName, modelRef, port)
	if apiKey != "" {
		log.Printf("API key auth enabled")
	}
	log.Fatal(http.ListenAndServe(":"+port, r))
}
