/*
 * test_kernel.c — bare-kernel unit tests (no framework; plain asserts).
 * Exercises real CapabilityManifest evaluation: default-deny, grant matching,
 * scope coverage, posture (audit vs allow), HITL on outward actions, fail-closed.
 * Run via `make test`.
 * SPDX-License-Identifier: Apache-2.0
 */
#include "gal_kernel.h"

#include <stdio.h>
#include <string.h>

static int failures = 0;

/* ---- a sample manifest (what the shell would build from gal/v1) ---- */
static const gal_grant_capability posey_caps[] = {
    { "read",  4, "repo",   4, "acme/*",   6 }, /* prefix scope            */
    { "write", 5, "config", 6, "acme/app", 8 }, /* exact, internal         */
    { "send",  4, "email",  5, "external", 8 }, /* granted, but outward    */
};
static const gal_grant_capability enforcer_caps[] = {
    { "read",  4, "repo",   4, "*", 1 },        /* any scope               */
};
static const gal_grant grants[] = {
    { "agent:posey",    11, "report_only", 11, posey_caps,    3 },
    { "agent:enforcer", 14, "enforce",      7, enforcer_caps, 1 },
};
static const gal_manifest manifest = { GAL_KERNEL_ABI_VERSION, grants, 2 };

static gal_request mkreq(const char *agent, const char *cap, const char *scope)
{
    gal_request r;
    memset(&r, 0, sizeof r);
    r.abi_version = GAL_KERNEL_ABI_VERSION;
    r.agent = agent;
    r.agent_len = agent ? strlen(agent) : 0u;
    r.capability = cap;
    r.capability_len = cap ? strlen(cap) : 0u;
    r.scope = scope;
    r.scope_len = scope ? strlen(scope) : 0u;
    return r;
}

static gal_effect run_decide(gal_request r, gal_status *st)
{
    char buf[256];
    gal_result out;
    memset(&out, 0, sizeof out);
    out.reason = buf;
    out.reason_cap = sizeof buf;
    gal_status s = gal_kernel_eval(&manifest, &r, &out);
    if (st) {
        *st = s;
    }
    return out.effect;
}

static void check(const char *name, int cond)
{
    if (cond) {
        printf("  ok   %s\n", name);
    } else {
        printf("  FAIL %s\n", name);
        failures++;
    }
}

int main(void)
{
    gal_status st;

    /* --- fail-closed --- */
    {
        gal_result out;
        memset(&out, 0, sizeof out);
        gal_request r = mkreq("agent:posey", "read:repo", "acme/app");
        check("null request => DENY+err",
              gal_kernel_eval(&manifest, NULL, &out) == GALK_ERR_NULL_ARG &&
                  out.effect == GAL_EFFECT_DENY);
        check("null out => err", gal_kernel_eval(&manifest, &r, NULL) == GALK_ERR_NULL_ARG);
        check("null manifest => DENY+err",
              gal_kernel_eval(NULL, &r, &out) == GALK_ERR_NULL_ARG &&
                  out.effect == GAL_EFFECT_DENY);
    }
    {
        gal_request r = mkreq("agent:posey", "read:repo", "acme/app");
        r.abi_version = 999u;
        check("abi mismatch => DENY", run_decide(r, &st) == GAL_EFFECT_DENY && st == GALK_ERR_ABI);
    }
    check("missing capability => DENY",
          run_decide(mkreq("agent:posey", NULL, "acme/app"), &st) == GAL_EFFECT_DENY &&
              st == GALK_ERR_BAD_INPUT);
    check("wildcard request scope => DENY",
          run_decide(mkreq("agent:posey", "read:repo", "*"), &st) == GAL_EFFECT_DENY && st == GALK_OK);
    check("non verb:noun => DENY",
          run_decide(mkreq("agent:posey", "readrepo", "acme/app"), &st) == GAL_EFFECT_DENY);

    /* --- default-deny / grant matching --- */
    check("unknown agent => DENY",
          run_decide(mkreq("agent:ghost", "read:repo", "acme/app"), &st) == GAL_EFFECT_DENY);
    check("granted read in-prefix-scope => AUDIT (report_only)",
          run_decide(mkreq("agent:posey", "read:repo", "acme/app"), &st) == GAL_EFFECT_AUDIT);
    check("granted read OUT-of-scope => DENY",
          run_decide(mkreq("agent:posey", "read:repo", "other/x"), &st) == GAL_EFFECT_DENY);
    check("granted internal write => AUDIT (report_only)",
          run_decide(mkreq("agent:posey", "write:config", "acme/app"), &st) == GAL_EFFECT_AUDIT);
    check("ungranted capability => DENY",
          run_decide(mkreq("agent:posey", "delete:everything", "acme/app"), &st) == GAL_EFFECT_DENY);

    /* --- HITL on outward actions --- */
    check("granted outward send@external => HUMAN_REQUIRED",
          run_decide(mkreq("agent:posey", "send:email", "external"), &st) == GAL_EFFECT_HUMAN_REQUIRED);

    /* --- posture: enforce => ALLOW --- */
    check("enforce posture, granted => ALLOW",
          run_decide(mkreq("agent:enforcer", "read:repo", "anything"), &st) == GAL_EFFECT_ALLOW);

    if (failures == 0) {
        printf("ALL TESTS PASSED\n");
        return 0;
    }
    printf("%d TEST(S) FAILED\n", failures);
    return 1;
}
