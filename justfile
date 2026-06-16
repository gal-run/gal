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
kernel:
    make -C kernel lib

kernel-test:
    make -C kernel test

# Install prebuilt libs + frozen header where cgo + release assets consume them.
kernel-install:
    make -C kernel install

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
