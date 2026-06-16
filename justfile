# gal monorepo orchestrator.
#
# Delegates to each ecosystem's NATIVE tool — NO Bazel:
#   kernel   -> make / cc      (libgal_decide.{a,so} + frozen header)
#   services -> go build       (single go.mod / go.work module)
#   sdks/mcp -> npm + turbo     (affected-only, remote-cached)
#   apps     -> npm + turbo
#   cli      -> cargo
#
# `just <surface>` builds one surface. `just all` runs in ABI order:
# the kernel header is produced FIRST so cgo + codegen consumers see it.

set shell := ["bash", "-uc"]

# Default: show the menu.
default:
    @just --list

# ---- kernel (C, at head) --------------------------------------------------
# The kernel is a clean copy of the public gal-run/gal-kernel reference monitor.
# It builds with its OWN Makefile (cc, -std=c11 -Werror); `all` compiles the
# core, `test` builds+runs the unit/shell suites. This is the ground truth the
# rest of the monorepo embeds via the C ABI (include/gal_decide.h).
kernel:
    make -C kernel all

kernel-test:
    make -C kernel test

# AddressSanitizer + UBSan over both suites (the kernel's safety-C discipline).
kernel-asan:
    make -C kernel asan

# ---- services (Go, OSS subset) -------------------------------------------
# Depends on the kernel lib being built first (cgo links libgal_decide).
services: kernel
    cd services && go build ./...

services-oss: kernel
    cd services && go build -tags oss ./...

services-test: kernel
    cd services && go test ./...

# ---- sdks + mcp (TS, published @gal-run/*) -------------------------------
sdks:
    npm run build -- --filter='./sdks/*'

mcp:
    npm run build -- --filter='./mcp/*'

# turbo affected-only across the TS workspace.
ts-affected:
    npm run build:affected

# ---- apps (dashboard Next.js + relocated console) ------------------------
apps:
    npm run build -- --filter='./apps/*'

# ---- cli (Rust) ----------------------------------------------------------
cli:
    cd cli && cargo build

cli-oss:
    cd cli && cargo build --no-default-features

cli-test:
    cd cli && cargo test

# ---- license fence (always-on, fast) -------------------------------------
fence:
    node tools/check-license-fence.mjs

# ---- everything, in ABI order --------------------------------------------
# kernel header first (cgo + codegen consumers), then services, then TS, cli.
all: kernel services sdks mcp apps cli fence

# OSS-only build: drop all ee/ code from every artifact.
all-oss: kernel services-oss sdks mcp apps cli-oss fence

test: kernel-test services-test cli-test
