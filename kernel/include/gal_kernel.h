/*
 * gal_kernel.h — the BARE reference-monitor core (pure C).
 *
 * This is the irreducible decision atom at the head of the tree. It is:
 *   - pure computation: a typed request in, a verdict out;
 *   - NO heap (all buffers caller-owned, fixed bounds);
 *   - NO IO / no syscalls;
 *   - NO untrusted parsing — the SHELL (gal_decide.c / a consumer) parses
 *     untrusted bytes and builds the typed gal_request BEFORE calling in here.
 *   - FAIL-CLOSED — any malformed input or inability to decide => DENY.
 *
 * Consumers normally use the higher-level JSON ABI in gal_decide.h (a thin
 * shell that parses, calls gal_kernel_eval, and serializes). Embedders that
 * already have typed data may call this core directly.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#ifndef GAL_KERNEL_H
#define GAL_KERNEL_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define GAL_KERNEL_ABI_VERSION 1u

/* Verdict effect. 0 == DENY so a zeroed/struct default is the safe outcome. */
typedef enum {
    GAL_EFFECT_DENY           = 0, /* block (default / safe) */
    GAL_EFFECT_ALLOW          = 1, /* permit */
    GAL_EFFECT_AUDIT          = 2, /* permit-but-record (report_only posture) */
    GAL_EFFECT_HUMAN_REQUIRED = 3  /* block pending human approval (HITL) */
} gal_effect;

/* Obligations the consumer MUST fulfil when permitting (bit flags, no heap). */
#define GAL_OBL_LOG          (1u << 0)
#define GAL_OBL_RECORD_AUDIT (1u << 1)
#define GAL_OBL_REDACT_PII   (1u << 2)
#define GAL_OBL_NOTIFY       (1u << 3)

/* Status codes. 0 == well-formed evaluation. Non-zero still yields DENY. */
typedef enum {
    GALK_OK            = 0,
    GALK_ERR_NULL_ARG  = 1,
    GALK_ERR_ABI       = 2, /* request abi_version mismatch */
    GALK_ERR_BAD_INPUT = 3  /* malformed/over-long field */
} gal_status;

/* A pre-validated key/value view the SHELL built from untrusted context.
 * All slices are caller-owned UTF-8 (ptr,len); the kernel never retains them. */
typedef struct {
    const char *key;
    size_t      key_len;
    const char *val;
    size_t      val_len;
} gal_kv;

/* A decision request. Caller-owned, fixed bounds; the kernel copies nothing
 * onto a heap and frees nothing. */
typedef struct {
    uint32_t    abi_version;             /* must == GAL_KERNEL_ABI_VERSION */
    const char *agent;       size_t agent_len;
    const char *capability;  size_t capability_len; /* "verb:noun" */
    const char *scope;       size_t scope_len;
    const char *action;      size_t action_len;      /* optional; len 0 = none */
    const gal_kv *context;   size_t context_len;     /* pre-parsed by the shell */
} gal_request;

/* ---- CapabilityManifest (typed; the SHELL builds this from the gal/v1 YAML/JSON) ----
 * Default-deny: only listed grants permit. Caller-owned slices; no heap. */

/* A granted capability: verb:noun + the scope it is granted for.
 * scope: "*" = any; a trailing slash-star = prefix match; otherwise exact. */
typedef struct {
    const char *verb;  size_t verb_len;
    const char *noun;  size_t noun_len;
    const char *scope; size_t scope_len;
} gal_grant_capability;

/* A grant to one agent identity: its posture + the capabilities it may exercise. */
typedef struct {
    const char *agent;   size_t agent_len;   /* matches gal_request.agent */
    const char *posture; size_t posture_len; /* "report_only" => AUDIT; else => ALLOW */
    const gal_grant_capability *caps; size_t caps_len;
} gal_grant;

/* The evaluated manifest. */
typedef struct {
    uint32_t         abi_version;            /* must == GAL_KERNEL_ABI_VERSION */
    const gal_grant *grants; size_t grants_len;
} gal_manifest;

/* The verdict. The kernel writes `reason` into the caller's fixed buffer; it
 * never allocates. reason_cap is the buffer capacity; reason_len is set to the
 * bytes written (truncated to fit, always NUL-terminated). */
typedef struct {
    gal_effect effect;
    uint32_t   obligations;           /* OR of GAL_OBL_* */
    char      *reason;                 /* caller-provided buffer (may be NULL) */
    size_t     reason_cap;            /* in: capacity */
    size_t     reason_len;           /* out: bytes written */
} gal_result;

/* Evaluate a request against a manifest. Pure, no heap, no IO. Default-deny:
 * only an explicit matching grant permits. FAIL-CLOSED: on bad args or any
 * inability to decide, *out is set to DENY and a non-zero status is returned.
 * Returns GAL_OK on a well-formed evaluation (effect may still be DENY). */
gal_status gal_kernel_eval(const gal_manifest *manifest,
                           const gal_request *req, gal_result *out);

/* Packed (major<<16)|minor. Major is the never-break contract. */
uint32_t gal_kernel_abi_version(void);

#ifdef __cplusplus
} /* extern "C" */
#endif
#endif /* GAL_KERNEL_H */
