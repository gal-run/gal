# gal kernel — pure-C build. Safe-C discipline: -Werror, sanitizers, cppcheck.
# See KERNEL-C-GUIDELINES.md.

CC      ?= cc
CFLAGS  ?= -std=c11 -Wall -Wextra -Werror -O2 -Iinclude -Ithird_party
KSRC    := src/gal_kernel.c
SSRC    := src/gal_kernel.c src/gal_decide.c
KTEST   := test/test_kernel
STEST   := test/test_shell

.PHONY: all test asan cppcheck clean

all:
	$(CC) $(CFLAGS) -c $(KSRC) -o /dev/null

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
	rm -f $(KTEST) $(STEST) $(KTEST)-asan $(STEST)-asan src/*.o
