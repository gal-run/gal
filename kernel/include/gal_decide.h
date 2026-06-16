/*
 * gal_decide.h — the frozen C ABI for the gal governance kernel (reference monitor).
 *
 * Design: JSON-bytes-in / JSON-bytes-out. The C symbols below are the STABLE,
 * never-break surface ("don't break userspace"); the request/response *wire
 * schema* (gal/v1 DecisionRequest / DecisionResult) evolves additively without
 * touching these symbols.
 *
 * Safety (the implementation MUST uphold all of these — it is a TCB):
 *   - Every entry point is panic-safe: catch_unwind + panic=abort; a Rust panic
 *     never unwinds across this boundary.
 *   - All (ptr,len) inputs are validated; bytes are validated UTF-8 where JSON.
 *   - Handles are opaque; ownership/free contracts are explicit (see each fn).
 *   - FAIL-CLOSED: on ANY non-zero status the caller MUST treat the outcome as
 *     DENY. There is no "allow on error".
 *   - The engine is thread-safe: gal_decide may be called concurrently on one
 *     GalEngine* from multiple threads.
 *
 * SPDX-License-Identifier: Apache-2.0 
 */
#ifndef GAL_DECIDE_H
#define GAL_DECIDE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ---- ABI version ---------------------------------------------------------
 * Packed (major << 16) | minor. MAJOR changes are forbidden by policy (the
 * surface is never-break); MINOR bumps are purely additive. Callers should
 * check the major matches what they compiled against.
 */
#define GAL_ABI_VERSION_MAJOR 1u
#define GAL_ABI_VERSION_MINOR 0u
uint32_t gal_abi_version(void);

/* ---- Status codes --------------------------------------------------------
 * 0 == OK. Anything else == error == treat the decision as DENY (fail-closed).
 */
typedef enum {
    GAL_OK              = 0,
    GAL_ERR_INVALID_ARG = 1, /* null/!aligned ptr, etc. */
    GAL_ERR_INVALID_UTF8= 2,
    GAL_ERR_PARSE       = 3, /* request JSON failed to parse/validate */
    GAL_ERR_NO_MANIFEST = 4, /* no CapabilityManifest loaded */
    GAL_ERR_INTERNAL    = 5,
    GAL_ERR_PANIC       = 6  /* a panic was caught at the boundary */
} GalStatus;

/* Opaque engine handle. Created once, shared across threads, freed once. */
typedef struct GalEngine GalEngine;

/* Create an engine. config_json is UTF-8 JSON bytes (may be NULL/0 for default
 * config). Returns NULL on failure (inspect gal_last_error()). Caller owns the
 * handle and MUST free it with gal_engine_free exactly once. */
GalEngine *gal_engine_new(const uint8_t *config_json, size_t config_len);

/* Load/replace the active CapabilityManifest (UTF-8 JSON or YAML bytes).
 * Hot-swappable; thread-safe w.r.t. concurrent gal_decide. Returns a GalStatus. */
int32_t gal_engine_load_manifest(GalEngine *engine,
                                 const uint8_t *manifest_bytes, size_t len);

/* The decision call. Reads a gal/v1 DecisionRequest (UTF-8 JSON), writes a
 * gal/v1 DecisionResult (UTF-8 JSON) into *out_json / *out_len.
 *   - On GAL_OK: *out_json is a gal-owned buffer the caller MUST free with
 *     gal_buffer_free(*out_json, *out_len).
 *   - On any non-zero status: *out_json is set to NULL, *out_len to 0, and the
 *     caller MUST fail closed (treat as denied). Never returns "allow on error".
 * Safe to call concurrently on one engine. */
int32_t gal_decide(GalEngine *engine,
                   const uint8_t *req_json, size_t req_len,
                   uint8_t **out_json, size_t *out_len);

/* Free a buffer previously returned by gal_decide. Idempotent on (NULL,0). */
void gal_buffer_free(uint8_t *buf, size_t len);

/* Free an engine. After this the handle is invalid. */
void gal_engine_free(GalEngine *engine);

/* Thread-local last-error string (UTF-8, NUL-terminated), or NULL if none.
 * Valid until the next gal_* call on the same thread. Do not free. */
const char *gal_last_error(void);

#ifdef __cplusplus
} /* extern "C" */
#endif
#endif /* GAL_DECIDE_H */
