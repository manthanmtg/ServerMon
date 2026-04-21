# Test Coverage Adder Prompt

## Objective

Find **one untested or undertested file** in the ServerMon codebase and add meaningful test coverage for it. This is a growth prompt — you are expanding the safety net, one file at a time.

## Philosophy

Coverage grows like a garden. Each run plants a few seeds. Over many runs, the entire codebase is covered. Don't try to cover everything at once — just cover one thing well.

## Workflow

### 1. Find an Uncovered File

- Scan `src/` for files that have **no corresponding test file** (`.test.ts` / `.test.tsx`).
- Prioritize in this order:
  1. `src/lib/` utilities (pure functions, easiest to test)
  2. `src/app/api/` route handlers (critical paths)
  3. `src/modules/*/ui/` components (complex UI logic)
  4. `src/components/` shared components
- If everything relevant has tests, pick the file with the **weakest coverage** (fewest test cases, missing edge cases).

### 2. Write Tests (One File Only)

- Create or extend the test file following existing patterns in the project.
- Write **5–15 focused test cases** covering:
  - Happy path (expected inputs → expected outputs)
  - Edge cases (empty arrays, null values, boundary conditions)
  - Error handling (invalid inputs, network failures via mocks)
- Use `vi.mock()` for external dependencies (DB, SSE, next/navigation).
- Use `vi.useFakeTimers()` for time-dependent logic.

### 3. No-Op Conditions

- If all critical files already have ≥80% coverage equivalent, log "coverage is healthy" and stop.
- If you can't figure out how to test a file without a massive test harness, log it to `issues_to_look/` with details on what's needed.

### 4. Verify

- Run `pnpm test` — all tests (old + new) must pass.
- Run `pnpm lint` — no lint issues from new test files.

### 5. Commit

- Commit with a message like: `test(lib/utils): add edge case tests for formatting`
- List what was covered in the commit body.

## Issue Management
- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
