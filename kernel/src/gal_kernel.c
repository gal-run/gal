/*
 * gal_kernel.c — the bare reference-monitor core (pure C).
 *
 * Real CapabilityManifest evaluation: default-deny; an action is permitted only
 * if the requesting agent has an explicit grant whose verb:noun + scope match.
 * Posture controls allow-vs-audit; outward/external actions escalate to HITL.
 *
 * Discipline (KERNEL-C-GUIDELINES.md): no heap, no IO, no untrusted parsing.
 * Only bounded (ptr,len) slices are inspected. Fail-closed: every error path
 * yields GAL_EFFECT_DENY.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#include "gal_kernel.h"

#include <string.h> /* memcmp, memcpy, strlen — bounded, on literals/known lengths */

#define GAL_MAX_FIELD 4096u

/* Compare a (ptr,len) slice to a NUL-terminated literal. */
static int slice_eq_lit(const char *p, size_t n, const char *lit)
{
    size_t l = strlen(lit);
    return n == l && memcmp(p, lit, n) == 0;
}

/* Compare two (ptr,len) slices. */
static int slice_eq(const char *a, size_t an, const char *b, size_t bn)
{
    return an == bn && (an == 0 || memcmp(a, b, an) == 0);
}

/* Index of the first ':' within [0,n), or n if absent. */
static size_t find_colon(const char *p, size_t n)
{
    for (size_t i = 0; i < n; i++) {
        if (p[i] == ':') {
            return i;
        }
    }
    return n;
}

static int is_wildcard_scope(const char *p, size_t n)
{
    return n == 0 || slice_eq_lit(p, n, "*") || slice_eq_lit(p, n, "all") ||
           slice_eq_lit(p, n, "any") || slice_eq_lit(p, n, "*:*");
}

/* Does a GRANTED scope cover the REQUESTED scope?
 * "*" => any; trailing "/" + "*" => prefix; otherwise exact. */
static int scope_covers(const char *g, size_t gn, const char *s, size_t sn)
{
    if (gn == 1 && g[0] == '*') {
        return 1;
    }
    if (gn >= 2 && g[gn - 1] == '*' && g[gn - 2] == '/') {
        size_t prefix = gn - 1; /* include the trailing '/' */
        return sn >= prefix && memcmp(g, s, prefix) == 0;
    }
    return slice_eq(g, gn, s, sn);
}

/* Outward/irreversible verb to an external scope => requires a human. */
static int is_outward(const char *verb, size_t vn, const char *scope, size_t sn)
{
    int out_verb = slice_eq_lit(verb, vn, "send") ||
                   slice_eq_lit(verb, vn, "post") ||
                   slice_eq_lit(verb, vn, "write");
    return out_verb && slice_eq_lit(scope, sn, "external");
}

/* Write a reason into the caller's fixed buffer (bounded, NUL-terminated). */
static void set_reason(gal_result *out, const char *msg)
{
    out->reason_len = 0;
    if (out->reason == NULL || out->reason_cap == 0) {
        return;
    }
    size_t m = strlen(msg);
    size_t cap = out->reason_cap - 1u;
    size_t k = (m < cap) ? m : cap;
    memcpy(out->reason, msg, k);
    out->reason[k] = '\0';
    out->reason_len = k;
}

uint32_t gal_kernel_abi_version(void)
{
    return (GAL_KERNEL_ABI_VERSION << 16); /* major.minor = 1.0 */
}

gal_status gal_kernel_eval(const gal_manifest *m, const gal_request *req, gal_result *out)
{
    if (out == NULL) {
        return GALK_ERR_NULL_ARG;
    }
    out->effect = GAL_EFFECT_DENY; /* fail-closed before any logic */
    out->obligations = 0u;
    out->reason_len = 0u;

    if (m == NULL || req == NULL) {
        set_reason(out, "deny: null argument");
        return GALK_ERR_NULL_ARG;
    }
    if (req->abi_version != GAL_KERNEL_ABI_VERSION || m->abi_version != GAL_KERNEL_ABI_VERSION) {
        set_reason(out, "deny: abi version mismatch");
        return GALK_ERR_ABI;
    }
    if (req->agent == NULL || req->agent_len == 0u ||
        req->capability == NULL || req->capability_len == 0u ||
        req->scope == NULL || req->scope_len == 0u) {
        set_reason(out, "deny: missing required field");
        return GALK_ERR_BAD_INPUT;
    }
    if (req->capability_len > GAL_MAX_FIELD || req->scope_len > GAL_MAX_FIELD ||
        req->agent_len > GAL_MAX_FIELD) {
        set_reason(out, "deny: field too long");
        return GALK_ERR_BAD_INPUT;
    }
    if (is_wildcard_scope(req->scope, req->scope_len)) {
        set_reason(out, "deny: wildcard request scope not allowed");
        return GALK_OK;
    }

    size_t colon = find_colon(req->capability, req->capability_len);
    if (colon == 0u || colon == req->capability_len) {
        set_reason(out, "deny: capability must be verb:noun");
        return GALK_OK;
    }
    const char *verb = req->capability;
    size_t verb_len = colon;
    const char *noun = req->capability + colon + 1u;
    size_t noun_len = req->capability_len - colon - 1u;

    /* Find the grant for this agent (default-deny if none). */
    const gal_grant *grant = NULL;
    for (size_t i = 0; i < m->grants_len; i++) {
        if (slice_eq(m->grants[i].agent, m->grants[i].agent_len, req->agent, req->agent_len)) {
            grant = &m->grants[i];
            break;
        }
    }
    if (grant == NULL) {
        set_reason(out, "deny: agent has no grant (default-deny)");
        return GALK_OK;
    }

    /* Match the requested capability verb:noun + scope against the grant. */
    int matched = 0;
    for (size_t i = 0; i < grant->caps_len; i++) {
        const gal_grant_capability *c = &grant->caps[i];
        if (slice_eq(c->verb, c->verb_len, verb, verb_len) &&
            slice_eq(c->noun, c->noun_len, noun, noun_len) &&
            scope_covers(c->scope, c->scope_len, req->scope, req->scope_len)) {
            matched = 1;
            break;
        }
    }
    if (!matched) {
        set_reason(out, "deny: no matching grant for capability/scope");
        return GALK_OK;
    }

    /* Permitted — choose the effect. Outward/external escalates to a human. */
    if (is_outward(verb, verb_len, req->scope, req->scope_len)) {
        out->effect = GAL_EFFECT_HUMAN_REQUIRED;
        out->obligations = GAL_OBL_RECORD_AUDIT | GAL_OBL_NOTIFY;
        set_reason(out, "human_required: outward action to external scope");
        return GALK_OK;
    }
    if (slice_eq_lit(grant->posture, grant->posture_len, "report_only")) {
        out->effect = GAL_EFFECT_AUDIT;
        out->obligations = GAL_OBL_LOG | GAL_OBL_RECORD_AUDIT;
        set_reason(out, "audit: granted (report_only posture)");
        return GALK_OK;
    }
    out->effect = GAL_EFFECT_ALLOW;
    out->obligations = GAL_OBL_LOG;
    set_reason(out, "allow: granted");
    return GALK_OK;
}
