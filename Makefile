# Root Makefile - thin delegator to the justfile orchestrator.
# `just` is the primary entrypoint; this exists so `make <target>` also works.
# Each surface delegates to its NATIVE tool (make/cc, go, npm+turbo, cargo).

.PHONY: all all-oss kernel kernel-test services services-oss sdks mcp apps cli tools-go tools-go-test accessibility-app fence test

all:               ; just all
all-oss:           ; just all-oss
kernel:            ; just kernel
kernel-test:       ; just kernel-test
services:          ; just services
services-oss:      ; just services-oss
sdks:              ; just sdks
mcp:               ; just mcp
apps:              ; just apps
cli:               ; just cli
tools-go:          ; just tools-go
tools-go-test:     ; just tools-go-test
accessibility-app: ; just accessibility-app
fence:             ; just fence
test:              ; just test
