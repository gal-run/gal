/*
 * test_shell.c — end-to-end tests for the JSON shell (gal_decide.h).
 * Loads a JSON manifest, calls gal_decide() with JSON requests, checks the
 * serialized verdict. Exercises the full untrusted-input path. Run via `make test`.
 * SPDX-License-Identifier: Apache-2.0
 */
#include "gal_decide.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int failures = 0;

static const char *MANIFEST =
    "{\"apiVersion\":\"gal/v1\",\"kind\":\"CapabilityManifest\",\"grants\":["
    "{\"agent\":\"agent:posey\",\"posture\":\"report_only\",\"capabilities\":["
    "{\"capability\":\"read:repo\",\"scope\":\"acme/*\"},"
    "{\"capability\":\"send:email\",\"scope\":\"external\"}]}]}";

static void decide_contains(GalEngine *e, const char *req, const char *needle, const char *name)
{
    uint8_t *out = NULL;
    size_t out_len = 0;
    int32_t st = gal_decide(e, (const uint8_t *)req, strlen(req), &out, &out_len);
    int ok = (st == 0 && out != NULL && strstr((char *)out, needle) != NULL);
    printf("  %s %s\n", ok ? "ok  " : "FAIL", name);
    if (!ok) {
        failures++;
        printf("     st=%d got=%.*s\n", st, (int)out_len, out ? (char *)out : "");
    }
    gal_buffer_free(out, out_len);
}

int main(void)
{
    GalEngine *e = gal_engine_new(NULL, 0);
    if (e == NULL) { printf("engine alloc failed\n"); return 1; }

    int32_t st = gal_engine_load_manifest(e, (const uint8_t *)MANIFEST, strlen(MANIFEST));
    if (st != 0) {
        printf("load_manifest failed st=%d err=%s\n", st, gal_last_error() ? gal_last_error() : "");
        return 1;
    }

    decide_contains(e, "{\"agent\":\"agent:posey\",\"capability\":\"read:repo\",\"scope\":\"acme/app\"}",
                    "\"action\":\"audit\"", "read in-scope => audit");
    decide_contains(e, "{\"agent\":\"agent:posey\",\"capability\":\"send:email\",\"scope\":\"external\"}",
                    "\"action\":\"human_required\"", "outward send => human_required");
    decide_contains(e, "{\"agent\":\"agent:posey\",\"capability\":\"read:repo\",\"scope\":\"other/x\"}",
                    "\"action\":\"denied\"", "out-of-scope => denied");
    decide_contains(e, "{\"agent\":\"agent:ghost\",\"capability\":\"read:repo\",\"scope\":\"acme/app\"}",
                    "\"action\":\"denied\"", "unknown agent => denied");
    decide_contains(e, "{\"agent\":\"agent:posey\",\"capability\":\"delete:all\",\"scope\":\"acme/app\"}",
                    "\"action\":\"denied\"", "ungranted => denied");

    /* no-manifest engine => GAL_ERR_NO_MANIFEST, out NULL */
    {
        GalEngine *e2 = gal_engine_new(NULL, 0);
        uint8_t *o = NULL; size_t ol = 0;
        int32_t s2 = gal_decide(e2, (const uint8_t *)"{}", 2, &o, &ol);
        int ok = (s2 == GAL_ERR_NO_MANIFEST && o == NULL);
        printf("  %s no-manifest => GAL_ERR_NO_MANIFEST + null out\n", ok ? "ok  " : "FAIL");
        if (!ok) { failures++; }
        gal_engine_free(e2);
    }

    gal_engine_free(e);
    if (failures == 0) { printf("ALL SHELL TESTS PASSED\n"); return 0; }
    printf("%d SHELL TEST(S) FAILED\n", failures);
    return 1;
}
