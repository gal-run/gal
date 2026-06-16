// Package handler provides shared HTTP handler utilities for all services.
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/gal-run/gal/services/lib/contracts"
)

// RespondJSON writes a JSON response with the given status code.
func RespondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			slog.Error("failed to encode response", "error", err)
		}
	}
}

// RespondError writes a standardized JSON error response.
func RespondError(w http.ResponseWriter, status int, message, code string) {
	RespondJSON(w, status, contracts.APIError{
		Error: message,
		Code:  code,
	})
}

// DecodeJSON decodes a JSON request body, enforcing a max size of 1MB.
func DecodeJSON(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}
