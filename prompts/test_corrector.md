# Test Corrector Prompt

## Objective

Find and fix any **currently failing tests** in the ServerMon codebase. This is a repair-only prompt — you are not adding new tests, just making the existing ones pass again.

## Philosophy

Failing tests erode trust in the test suite. If tests are always red, developers stop looking at them. This prompt ensures the suite stays green so it remains a useful safety net.

## Workflow

### 1. Run the Suite

- Execute `pnpm test` and capture the output.
- If **all tests pass**, you're done — no-op. Log "all tests passing" and stop.

### 2. Triage Failures

For each failing test, determine the root cause:

- **Test is wrong** (outdated assertion, stale snapshot, renamed prop) → fix the test.
- **Code is wrong** (genuine regression, broken logic) → fix the code, but only if the fix is small and obvious. If it's complex, log it to `issues_to_look/` instead.
- **Environment issue** (missing mock, flaky timing) → stabilize the test with proper mocks or `waitFor`.

### 3. Fix (Small Fixes Only)

- Fix **at most 5 tests** per run. If more are broken, fix the easiest 5 and log the rest in `issues_to_look/`.
- Each fix must be isolated — don't refactor surrounding code.
- If fixing a test requires changing production code, the production change must be ≤10 lines.

### 4. Verify

- Run `pnpm test` again — confirm your fixes resolved the failures without introducing new ones.
- Run `pnpm lint` to confirm no lint regressions.

### 5. Commit

- Commit with a message like: `fix(tests): repair 3 failing tests in terminal module`
- List which tests were fixed and why in the commit body.

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
