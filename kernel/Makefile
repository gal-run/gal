# kernel/Makefile - pure-C reference monitor.
# Produces libgal_decide.a + libgal_decide.so and installs the frozen header.
# This is the ground truth that cgo + codegen consumers bind to.

CC      ?= cc
CFLAGS  ?= -std=c11 -Wall -Wextra -Werror -O2 -fPIC -Iinclude
AR      ?= ar
PREFIX  ?= dist

SRC      := src/gal_decide.c
OBJ      := $(SRC:.c=.o)
HEADER   := include/gal/gal_decide.h

STATIC   := libgal_decide.a
SHARED   := libgal_decide.so
TEST_BIN := abi_conformance

.PHONY: all lib test install clean

all: lib

lib: $(STATIC) $(SHARED)

$(STATIC): $(OBJ)
	$(AR) rcs $@ $^

$(SHARED): $(OBJ)
	$(CC) $(CFLAGS) -shared -o $@ $^

%.o: %.c $(HEADER)
	$(CC) $(CFLAGS) -c $< -o $@

# ABI conformance: the kernel's own contract test.
test: $(TEST_BIN)
	./$(TEST_BIN)

$(TEST_BIN): tests/abi_conformance.c $(STATIC)
	$(CC) $(CFLAGS) tests/abi_conformance.c $(STATIC) -o $@

# Release layout: prebuilt libs + header, consumed by cgo and as a release asset.
install: lib
	mkdir -p $(PREFIX)/lib $(PREFIX)/include/gal
	cp $(STATIC) $(SHARED) $(PREFIX)/lib/
	cp $(HEADER) $(PREFIX)/include/gal/

clean:
	rm -f $(OBJ) $(STATIC) $(SHARED) $(TEST_BIN)
	rm -rf $(PREFIX)
