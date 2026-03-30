# Test Adder Prompt

## Objective

Increase the quality and reliability of ServerMon by adding comprehensive tests.

## Requirements

1.  **Vitest (Unit/Integration)**:
    - Place `[file].test.ts` or `[Component].test.tsx` next to the source.
    - Mock external dependencies (DB, SSE, Socket.io) using `vi.mock()`.
    - Focus on edge cases and error handling in API routes.
2.  **Playwright (E2E)**:
    - Add tests in the `/e2e` directory for critical user flows (e.g., login, terminal connection, process management).
    - Ensure tests run against the local dev environment.
3.  **Coverage**:
    - Aim for >80% coverage on core "lib" utilities and API handlers.

## Workflow

- **Identify Gaps**: Run `pnpm test:coverage` to find untested areas.
- **Skeleton First**: Write the test suites and cases before implementation if possible (TDD).
- **Verify**: Ensure `pnpm test` passes with zero failures.
