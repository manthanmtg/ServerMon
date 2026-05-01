---
id: test-adder
title: Test Adder Prompt
category: testing
enabled: true
autonomousSafe: true
---

# Test Adder Prompt

## Objective

Increase the quality and reliability of ServerMon by adding **5-15 meaningful tests** to **one area that already has test coverage** per run. This prompt strengthens existing tests; use `test_coverage_adder.md` for creating a brand-new test file around untested code.

## Requirements

1.  **Vitest (Unit/Integration)**:
    - Place `[file].test.ts` or `[Component].test.tsx` next to the source.
    - Mock external dependencies (DB, SSE, Socket.io) using `vi.mock()`.
    - Focus on edge cases and error handling in API routes.
2.  **Coverage**:
    - Aim for >80% coverage on core "lib" utilities and API handlers.

## Workflow

1. **Identify Gaps**: Prefer `pnpm test:coverage` when available. If coverage instrumentation is too slow or blocked, inspect existing `*.test.ts` and `*.test.tsx` files for shallow assertions, missing edge cases, or uncovered error paths.
2. **Choose One Target**: Extend tests for one already-tested source file only. Do not mix unrelated coverage improvements in the same run.
3. **Write Tests First**: Define the expected behavior before changing production code. If production code must change, keep it minimal and explain why in the commit body.
4. **Verify**: Run the focused test file first, then `pnpm test`. Run `pnpm lint` if new test code was added.

## No-Op Protocol

- If all existing critical tests already cover meaningful happy paths, edge cases, and errors, **stop** — log "test coverage is healthy" and no-op.
- If the best improvement requires creating a brand-new test harness or test file, leave it for `test_coverage_adder.md` and no-op unless there is a specific known issue to log.
- If the target already has a known coverage issue in `issues_to_look/`, update or resolve that note instead of creating a duplicate.

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
