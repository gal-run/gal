/*
 * gal_decide.c - reference monitor implementation (skeleton).
 *
 * This is a deliberately minimal, default-deny stub that satisfies the
 * frozen ABI in include/gal/gal_decide.h. Real policy evaluation lands
 * incrementally; the contract above does not change.
 *
 * License: Apache-2.0 (outside any ee/ directory).
 */
#include "gal/gal_decide.h"

#include <stdlib.h>

struct gal_ctx {
    int has_license; /* 0 in OSS builds; populated from a verified key otherwise */
};

gal_ctx_t *gal_ctx_create(void) {
    gal_ctx_t *ctx = (gal_ctx_t *)calloc(1, sizeof(*ctx));
    return ctx; /* has_license defaults to 0 -> ee inert */
}

void gal_ctx_destroy(gal_ctx_t *ctx) {
    free(ctx);
}

gal_decision_t gal_decide(gal_ctx_t *ctx, const gal_request_t *req) {
    gal_decision_t d;
    d.verdict = GAL_DENY;
    d.reason_code = 0;
    d.reason = "default-deny (skeleton monitor)";

    if (ctx == NULL || req == NULL) {
        d.verdict = GAL_ERROR;
        d.reason = "null context or request";
        return d;
    }

    /* ee-gated capabilities require a valid license; otherwise deny. */
    if (req->capability == GAL_CAP_EE_FEATURE && !gal_license_allows(ctx, req->capability)) {
        d.reason = "ee capability requires a valid license";
        return d;
    }

    /* Skeleton: deny by default. Policy engine to be wired here. */
    return d;
}

int gal_license_allows(gal_ctx_t *ctx, gal_capability_t cap) {
    if (ctx == NULL) {
        return 0;
    }
    if (cap == GAL_CAP_EE_FEATURE) {
        return ctx->has_license; /* 0 in OSS builds */
    }
    return 1; /* non-ee capabilities are not license-gated */
}

uint32_t gal_abi_version(void) {
    return ((uint32_t)GAL_ABI_VERSION_MAJOR << 16) | (uint32_t)GAL_ABI_VERSION_MINOR;
}
