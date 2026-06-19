# gal kernel — pure-C build. Safe-C discipline: -Werror, sanitizers, cppcheck.
# See KERNEL-C-GUIDELINES.md.

CC      ?= cc
CFLAGS  ?= -std=c11 -Wall -Wextra -Werror -O2 -Iinclude -Ithird_party
KSRC    := src/gal_kernel.c
SSRC    := src/gal_kernel.c src/gal_decide.c
KTEST   := test/test_kernel
STEST   := test/test_shell
LIBNAME := gal_decide
STATICLIB := lib$(LIBNAME).a
SHAREDLIB := lib$(LIBNAME).so

.PHONY: all lib test asan cppcheck clean

all:
	$(CC) $(CFLAGS) -c $(KSRC) -o /dev/null

# Build the consumer-ABI libraries (libgal_decide.{a,so}) that downstream
# cgo bindings and services link against. Compiled position-independent so the
# same objects archive into the static lib and link into the shared lib.
# deploy/Dockerfile.service runs `make lib` and COPYs both artifacts.
lib: $(STATICLIB) $(SHAREDLIB)

$(STATICLIB): $(SSRC)
	$(CC) $(CFLAGS) -fPIC -c src/gal_kernel.c -o src/gal_kernel.o
	$(CC) $(CFLAGS) -fPIC -c src/gal_decide.c -o src/gal_decide.o
	$(AR) rcs $@ src/gal_kernel.o src/gal_decide.o

$(SHAREDLIB): $(SSRC)
	$(CC) $(CFLAGS) -fPIC -shared $(SSRC) -o $@

# Build + run unit tests (kernel core + JSON shell).
test:
	$(CC) $(CFLAGS) $(KSRC) test/test_kernel.c -o $(KTEST)
	./$(KTEST)
	$(CC) $(CFLAGS) $(SSRC) test/test_shell.c -o $(STEST)
	./$(STEST)

# AddressSanitizer + UndefinedBehaviorSanitizer on both test suites.
asan:
	$(CC) -std=c11 -Wall -Wextra -Werror -g -O1 -Iinclude -Ithird_party -fsanitize=address,undefined \
		$(KSRC) test/test_kernel.c -o $(KTEST)-asan
	./$(KTEST)-asan
	$(CC) -std=c11 -Wall -Wextra -Werror -g -O1 -Iinclude -Ithird_party -fsanitize=address,undefined \
		$(SSRC) test/test_shell.c -o $(STEST)-asan
	./$(STEST)-asan

# Static analysis (jsmn vendored header suppressed — not our code).
cppcheck:
	cppcheck --std=c11 --enable=warning,style,performance,portability \
		--suppress='*:third_party/*' --error-exitcode=1 -Iinclude -Ithird_party src test

clean:
	rm -f $(KTEST) $(STEST) $(KTEST)-asan $(STEST)-asan src/*.o $(STATICLIB) $(SHAREDLIB)
