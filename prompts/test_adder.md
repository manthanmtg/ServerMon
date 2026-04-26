# Test Adder Prompt

## Objective

Increase the quality and reliability of ServerMon by adding **5-15 meaningful tests** to **one untested or undertested area** per run. Coverage grows incrementally.

## Requirements

1.  **Vitest (Unit/Integration)**:
    - Place `[file].test.ts` or `[Component].test.tsx` next to the source.
    - Mock external dependencies (DB, SSE, Socket.io) using `vi.mock()`.
    - Focus on edge cases and error handling in API routes.
2.  **Coverage**:
    - Aim for >80% coverage on core "lib" utilities and API handlers.

## Workflow

1. **Identify Gaps**: Prefer `pnpm test:coverage` when available. If coverage instrumentation is too slow or blocked, use `rg --files src | rg -v '\\.test\\.(ts|tsx)$'` and prioritize pure `src/lib/` utilities, API route helpers, and complex module UI logic.
2. **Choose One Target**: Add or extend tests for one source file only. Do not mix unrelated coverage improvements in the same run.
3. **Write Tests First**: Define the expected behavior before changing production code. If production code must change, keep it minimal and explain why in the commit body.
4. **Verify**: Run the focused test file first, then `pnpm test`. Run `pnpm lint` if new test code was added.

## No-Op Protocol

- If all critical files already have solid tests, **stop** — log "test coverage is healthy" and no-op.
- If testing a file requires building a complex test harness that doesn't exist yet, log it in `issues_to_look/` with details.
- If the target already has a known coverage issue in `issues_to_look/`, update or resolve that note instead of creating a duplicate.

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
