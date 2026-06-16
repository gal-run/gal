/*
 * gal_decide.h - FROZEN ABI for the gal reference monitor (kernel).
 *
 * This is THE contract the entire gal monorepo binds to. Every other
 * surface (Go services via cgo, generated TS/Rust bindings) is downstream
 * of this header. Treat it as append-only: do NOT change the signature,
 * struct layout, or enum values of anything already shipped. New capability
 * codes append at the end; new fields go behind a new versioned struct.
 *
 * License: Apache-2.0 (this file is outside any ee/ directory).
 */
#ifndef GAL_DECIDE_H
#define GAL_DECIDE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ABI version. Bumped only on additive change; never on breaking change. */
#define GAL_ABI_VERSION_MAJOR 1
#define GAL_ABI_VERSION_MINOR 0

/* Decision verdicts returned by the reference monitor. FROZEN. */
typedef enum gal_verdict {
    GAL_DENY        = 0, /* request is refused */
    GAL_ALLOW       = 1, /* request is permitted */
    GAL_ALLOW_HITL  = 2, /* permitted only with human-in-the-loop confirmation */
    GAL_ERROR       = 3  /* monitor could not decide (treat as DENY upstream) */
} gal_verdict_t;

/* Capability codes. Append-only; existing values are FROZEN. */
typedef enum gal_capability {
    GAL_CAP_NONE        = 0,
    GAL_CAP_FS_READ     = 1,
    GAL_CAP_FS_WRITE    = 2,
    GAL_CAP_NET_OUT     = 3,
    GAL_CAP_EXEC        = 4,
    GAL_CAP_SECRET_READ = 5,
    GAL_CAP_EE_FEATURE  = 6  /* gated commercial capability; inert without license */
} gal_capability_t;

/* Immutable request descriptor handed to the monitor. FROZEN layout. */
typedef struct gal_request {
    uint32_t         abi_version;  /* (major << 16) | minor of caller */
    gal_capability_t capability;   /* what the agent wants to do */
    const char      *subject;      /* agent / principal id (NUL-terminated) */
    const char      *resource;     /* target resource (NUL-terminated) */
    const char      *context_json; /* opaque policy context (NUL-terminated, may be NULL) */
} gal_request_t;

/* Decision result. FROZEN layout. */
typedef struct gal_decision {
    gal_verdict_t verdict;
    int32_t       reason_code; /* monitor-specific, 0 == ok */
    const char   *reason;      /* static/owned message; valid until next call on this ctx */
} gal_decision_t;

/* Opaque monitor context. */
typedef struct gal_ctx gal_ctx_t;

/* Lifecycle. */
gal_ctx_t *gal_ctx_create(void);
void       gal_ctx_destroy(gal_ctx_t *ctx);

/* Core decision entrypoint. Pure: same inputs -> same verdict. */
gal_decision_t gal_decide(gal_ctx_t *ctx, const gal_request_t *req);

/*
 * License capability check. Returns 1 if a valid signed license key enables
 * the given (ee) capability, 0 otherwise. OSS builds always return 0 for
 * GAL_CAP_EE_FEATURE so ee/ code paths stay inert. FROZEN.
 */
int gal_license_allows(gal_ctx_t *ctx, gal_capability_t cap);

/* Returns the compiled-in ABI version as (major << 16) | minor. */
uint32_t gal_abi_version(void);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* GAL_DECIDE_H */
