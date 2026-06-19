/*
 * gal_decide.c — the SHELL: the JSON-in / JSON-out consumer ABI (gal_decide.h).
 *
 * This is where ALL untrusted parsing lives. It parses JSON (manifest + request)
 * into the bare kernel's typed structs, calls gal_kernel_eval (pure, no parsing),
 * and serializes the verdict. The bare core (gal_kernel.c) never sees raw bytes.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#include "gal_decide.h"
#include "gal_kernel.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Vendored MIT JSON parser (third_party/jsmn.h). Quarantine its warnings so our
 * strict -Werror build stays clean without modifying upstream. */
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-compare"
#pragma GCC diagnostic ignored "-Wunused-parameter"
#pragma GCC diagnostic ignored "-Wunused-function"
#include "jsmn.h"
#pragma GCC diagnostic pop

/* Thread-local last error. */
static _Thread_local char g_err[256];
static void set_err(const char *m) { snprintf(g_err, sizeof g_err, "%s", m); }
const char *gal_last_error(void) { return g_err[0] ? g_err : NULL; }

uint32_t gal_abi_version(void) { return (GAL_ABI_VERSION_MAJOR << 16) | GAL_ABI_VERSION_MINOR; }

/* ---------------- engine: holds a parsed, owned manifest ---------------- */
struct GalEngine {
    char                 *buf;       /* owned copy of manifest bytes; slices point here */
    gal_grant            *grants;
    gal_grant_capability *caps;      /* flat pool; grants point into it */
    gal_manifest          manifest;
    int                   loaded;
};

GalEngine *gal_engine_new(const uint8_t *config_json, size_t config_len)
{
    (void)config_json; (void)config_len; /* no config knobs yet */
    GalEngine *e = calloc(1, sizeof *e);
    if (e == NULL) { set_err("engine alloc failed"); }
    return e;
}

static void free_manifest(GalEngine *e)
{
    free(e->buf);    e->buf = NULL;
    free(e->grants); e->grants = NULL;
    free(e->caps);   e->caps = NULL;
    memset(&e->manifest, 0, sizeof e->manifest);
    e->loaded = 0;
}

void gal_engine_free(GalEngine *e)
{
    if (e == NULL) { return; }
    free_manifest(e);
    free(e);
}

/* ---------------- jsmn helpers ---------------- */
static int tok_is(const char *js, const jsmntok_t *t, const char *s)
{
    size_t n = (size_t)(t->end - t->start);
    return strlen(s) == n && strncmp(js + t->start, s, n) == 0;
}

/* Index just past token i and all its descendants. */
static int tok_skip(const jsmntok_t *t, int i)
{
    int j;
    if (t[i].type == JSMN_OBJECT) {
        int next = i + 1;
        for (j = 0; j < t[i].size; j++) { next = tok_skip(t, next); next = tok_skip(t, next); }
        return next;
    }
    if (t[i].type == JSMN_ARRAY) {
        int next = i + 1;
        for (j = 0; j < t[i].size; j++) { next = tok_skip(t, next); }
        return next;
    }
    return i + 1; /* STRING / PRIMITIVE */
}

/* Value-token index for key in object token `obj`, or -1. */
static int obj_get(const char *js, const jsmntok_t *t, int obj, const char *key)
{
    if (obj < 0 || t[obj].type != JSMN_OBJECT) { return -1; }
    int j = obj + 1;
    for (int k = 0; k < t[obj].size; k++) {
        int keytok = j, valtok = j + 1;
        if (t[keytok].type == JSMN_STRING && tok_is(js, &t[keytok], key)) { return valtok; }
        j = tok_skip(t, valtok);
    }
    return -1;
}

static void slice_of(const char *js, const jsmntok_t *t, int i, const char **p, size_t *n)
{
    if (i < 0 || t[i].type != JSMN_STRING) { *p = NULL; *n = 0; return; }
    *p = js + t[i].start;
    *n = (size_t)(t[i].end - t[i].start);
}

/* ---------------- manifest loading ---------------- */
int32_t gal_engine_load_manifest(GalEngine *e, const uint8_t *bytes, size_t len)
{
    if (e == NULL || bytes == NULL) { set_err("load_manifest: null arg"); return GAL_ERR_INVALID_ARG; }
    free_manifest(e);

    e->buf = malloc(len + 1);
    if (e->buf == NULL) { set_err("load_manifest: alloc"); return GAL_ERR_INTERNAL; }
    memcpy(e->buf, bytes, len);
    e->buf[len] = '\0';
    const char *js = e->buf;

    jsmn_parser p;
    jsmn_init(&p);
    int ntok = jsmn_parse(&p, js, len, NULL, 0);
    if (ntok < 1) { set_err("load_manifest: bad json"); return GAL_ERR_PARSE; }
    jsmntok_t *t = calloc((size_t)ntok, sizeof *t);
    if (t == NULL) { set_err("load_manifest: tok alloc"); return GAL_ERR_INTERNAL; }
    jsmn_init(&p);
    if (jsmn_parse(&p, js, len, t, (unsigned)ntok) < 1 || t[0].type != JSMN_OBJECT) {
        free(t); set_err("load_manifest: not an object"); return GAL_ERR_PARSE;
    }

    int grants_tok = obj_get(js, t, 0, "grants");
    if (grants_tok < 0 || t[grants_tok].type != JSMN_ARRAY) {
        free(t); set_err("load_manifest: missing grants[]"); return GAL_ERR_PARSE;
    }
    int n_grants = t[grants_tok].size;

    /* size the cap pool */
    size_t total_caps = 0;
    int gi = grants_tok + 1;
    for (int g = 0; g < n_grants; g++) {
        int caps_tok = obj_get(js, t, gi, "capabilities");
        if (caps_tok >= 0 && t[caps_tok].type == JSMN_ARRAY) { total_caps += (size_t)t[caps_tok].size; }
        gi = tok_skip(t, gi);
    }

    e->grants = calloc((size_t)(n_grants > 0 ? n_grants : 1), sizeof *e->grants);
    e->caps   = calloc(total_caps > 0 ? total_caps : 1, sizeof *e->caps);
    if (e->grants == NULL || e->caps == NULL) { free(t); set_err("load_manifest: alloc"); return GAL_ERR_INTERNAL; }

    size_t cap_w = 0;
    gi = grants_tok + 1;
    for (int g = 0; g < n_grants; g++) {
        gal_grant *gr = &e->grants[g];
        slice_of(js, t, obj_get(js, t, gi, "agent"),   &gr->agent,   &gr->agent_len);
        slice_of(js, t, obj_get(js, t, gi, "posture"), &gr->posture, &gr->posture_len);
        gr->caps = &e->caps[cap_w];
        gr->caps_len = 0;
        int caps_tok = obj_get(js, t, gi, "capabilities");
        if (caps_tok >= 0 && t[caps_tok].type == JSMN_ARRAY) {
            int ci = caps_tok + 1;
            for (int c = 0; c < t[caps_tok].size; c++) {
                gal_grant_capability *gc = &e->caps[cap_w++];
                const char *cap = NULL; size_t cap_len = 0;
                slice_of(js, t, obj_get(js, t, ci, "capability"), &cap, &cap_len);
                slice_of(js, t, obj_get(js, t, ci, "scope"), &gc->scope, &gc->scope_len);
                /* split "verb:noun" */
                size_t colon = 0; while (colon < cap_len && cap[colon] != ':') { colon++; }
                if (colon > 0 && colon < cap_len) {
                    gc->verb = cap; gc->verb_len = colon;
                    gc->noun = cap + colon + 1; gc->noun_len = cap_len - colon - 1;
                } else {
                    gc->verb = NULL; gc->verb_len = 0; gc->noun = NULL; gc->noun_len = 0;
                }
                gr->caps_len++;
                ci = tok_skip(t, ci);
            }
        }
        gi = tok_skip(t, gi);
    }
    free(t);

    e->manifest.abi_version = GAL_KERNEL_ABI_VERSION;
    e->manifest.grants = e->grants;
    e->manifest.grants_len = (size_t)n_grants;
    e->loaded = 1;
    g_err[0] = '\0';
    return GAL_OK;
}

/* ---------------- decide ---------------- */
static const char *effect_str(gal_effect ef)
{
    switch (ef) {
        case GAL_EFFECT_ALLOW:          return "allowed";
        case GAL_EFFECT_AUDIT:          return "audit";
        case GAL_EFFECT_HUMAN_REQUIRED: return "human_required";
        case GAL_EFFECT_DENY: default:  return "denied";
    }
}

int32_t gal_decide(GalEngine *e, const uint8_t *req_json, size_t req_len,
                   uint8_t **out_json, size_t *out_len)
{
    if (out_json) { *out_json = NULL; }
    if (out_len) { *out_len = 0; }
    if (e == NULL || req_json == NULL || out_json == NULL || out_len == NULL) {
        set_err("decide: null arg"); return GAL_ERR_INVALID_ARG;
    }
    if (!e->loaded) { set_err("decide: no manifest"); return GAL_ERR_NO_MANIFEST; }

    const char *js = (const char *)req_json;
    jsmn_parser p; jsmn_init(&p);
    int ntok = jsmn_parse(&p, js, req_len, NULL, 0);
    if (ntok < 1) { set_err("decide: bad request json"); return GAL_ERR_PARSE; }
    jsmntok_t *t = calloc((size_t)ntok, sizeof *t);
    if (t == NULL) { set_err("decide: tok alloc"); return GAL_ERR_INTERNAL; }
    jsmn_init(&p);
    if (jsmn_parse(&p, js, req_len, t, (unsigned)ntok) < 1 || t[0].type != JSMN_OBJECT) {
        free(t); set_err("decide: request not an object"); return GAL_ERR_PARSE;
    }

    gal_request req;
    memset(&req, 0, sizeof req);
    req.abi_version = GAL_KERNEL_ABI_VERSION;
    slice_of(js, t, obj_get(js, t, 0, "agent"),      &req.agent,      &req.agent_len);
    slice_of(js, t, obj_get(js, t, 0, "capability"), &req.capability, &req.capability_len);
    slice_of(js, t, obj_get(js, t, 0, "scope"),      &req.scope,      &req.scope_len);
    slice_of(js, t, obj_get(js, t, 0, "action"),     &req.action,     &req.action_len);

    char reason[256];
    gal_result r;
    memset(&r, 0, sizeof r);
    r.reason = reason; r.reason_cap = sizeof reason;
    (void)gal_kernel_eval(&e->manifest, &req, &r); /* fail-closed inside */
    free(t);

    /* serialize verdict (reason is kernel-controlled ASCII; no escaping needed) */
    char obl[128]; size_t ow = 0; obl[0] = '\0';
    #define ADD_OBL(flag, name) do { if (r.obligations & (flag)) { \
        ow += (size_t)snprintf(obl + ow, sizeof obl - ow, "%s\"%s\"", ow ? "," : "", name); } } while (0)
    ADD_OBL(GAL_OBL_LOG, "log");
    ADD_OBL(GAL_OBL_RECORD_AUDIT, "record_audit");
    ADD_OBL(GAL_OBL_REDACT_PII, "redact_pii");
    ADD_OBL(GAL_OBL_NOTIFY, "notify");
    #undef ADD_OBL

    int allowed = (r.effect == GAL_EFFECT_ALLOW || r.effect == GAL_EFFECT_AUDIT);
    char *buf = malloc(512);
    if (buf == NULL) { set_err("decide: out alloc"); return GAL_ERR_INTERNAL; }
    int n = snprintf(buf, 512,
        "{\"apiVersion\":\"gal/v1\",\"kind\":\"DecisionResult\",\"allowed\":%s,"
        "\"action\":\"%s\",\"reason\":\"%s\",\"obligations\":[%s]}",
        allowed ? "true" : "false", effect_str(r.effect), reason, obl);
    if (n < 0 || n >= 512) { free(buf); set_err("decide: serialize overflow"); return GAL_ERR_INTERNAL; }

    *out_json = (uint8_t *)buf;
    *out_len = (size_t)n;
    g_err[0] = '\0';
    return GAL_OK;
}

void gal_buffer_free(uint8_t *buf, size_t len) { (void)len; free(buf); }
