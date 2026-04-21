# Test Adder Prompt

## Objective

Increase the quality and reliability of ServerMon by adding **5-15 comprehensive tests** to **one untested or undertested area** per run. Coverage grows incrementally.

## Requirements

1.  **Vitest (Unit/Integration)**:
    - Place `[file].test.ts` or `[Component].test.tsx` next to the source.
    - Mock external dependencies (DB, SSE, Socket.io) using `vi.mock()`.
    - Focus on edge cases and error handling in API routes.
2.  **Coverage**:
    - Aim for >80% coverage on core "lib" utilities and API handlers.

## Workflow

- **Identify Gaps**: Run `pnpm test:coverage` to find one untested area.
- **Skeleton First**: Write the test suites and cases before implementation if possible (TDD).
- **Verify**: Ensure `pnpm test` passes with zero failures.

## No-Op Protocol

- If all critical files already have solid tests, **stop** — log "test coverage is healthy" and no-op.
- If testing a file requires building a complex test harness that doesn't exist yet, log it in `issues_to_look/` with details.

## Issue Management
- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
