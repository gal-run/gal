/*
 * abi_conformance.c - ABI conformance tests for the frozen gal_decide.h.
 *
 * These assertions pin the contract: enum values, struct sizes/offsets,
 * and the default-deny behavior. If a change breaks these, it is a
 * breaking ABI change and must NOT ship under the same major version.
 *
 * License: Apache-2.0 (outside any ee/ directory).
 */
#include "gal/gal_decide.h"

#include <assert.h>
#include <stddef.h>
#include <stdio.h>

int main(void) {
    /* Frozen enum values. */
    assert(GAL_DENY == 0);
    assert(GAL_ALLOW == 1);
    assert(GAL_ALLOW_HITL == 2);
    assert(GAL_ERROR == 3);

    assert(GAL_CAP_NONE == 0);
    assert(GAL_CAP_FS_READ == 1);
    assert(GAL_CAP_FS_WRITE == 2);
    assert(GAL_CAP_NET_OUT == 3);
    assert(GAL_CAP_EXEC == 4);
    assert(GAL_CAP_SECRET_READ == 5);
    assert(GAL_CAP_EE_FEATURE == 6);

    /* Frozen struct field offsets (caller/cgo rely on these). */
    assert(offsetof(gal_request_t, abi_version) == 0);

    /* ABI version helper. */
    assert(gal_abi_version() == (((uint32_t)1 << 16) | 0u));

    /* Default-deny behavior + ee inert without license. */
    gal_ctx_t *ctx = gal_ctx_create();
    assert(ctx != NULL);

    gal_request_t req = {0};
    req.abi_version = gal_abi_version();
    req.capability = GAL_CAP_FS_READ;
    req.subject = "agent:test";
    req.resource = "/tmp/x";
    req.context_json = NULL;

    gal_decision_t d = gal_decide(ctx, &req);
    assert(d.verdict == GAL_DENY); /* skeleton default-deny */

    req.capability = GAL_CAP_EE_FEATURE;
    d = gal_decide(ctx, &req);
    assert(d.verdict == GAL_DENY); /* ee inert in OSS build */
    assert(gal_license_allows(ctx, GAL_CAP_EE_FEATURE) == 0);

    d = gal_decide(NULL, &req);
    assert(d.verdict == GAL_ERROR);

    gal_ctx_destroy(ctx);

    printf("ok: ABI conformance passed (abi v%u.%u)\n",
           GAL_ABI_VERSION_MAJOR, GAL_ABI_VERSION_MINOR);
    return 0;
}
