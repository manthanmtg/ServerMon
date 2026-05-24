# Test Corrector Remaining Failing Tests

Date: 2026-05-24
Prompt: test-corrector
Run: partial fix (maximum 5 tests fixed this cycle)

## Remaining failures (unresolved)

- `src/modules/self-service/engine/compose-executor.test.ts`
  - 6 failures across all compose executor cases.
  - Cause: `ShellExecutor` mock currently uses an arrow-function factory and is not constructable (`TypeError: ... is not a constructor`) when `ComposeExecutor` creates `new ShellExecutor()`.

- `src/app/api/modules/docker/[containerId]/route.test.ts`
  - 3 failures expecting HTTP 200/404.
  - Cause: route now calls `getSession()` which reads Next `cookies()`; tests invoke handler without request context and hit `cookies` outside request scope.

- `src/app/api/modules/docker/images/[imageId]/route.test.ts`
  - 3 failures around service success/error assertions and unauthorized context.
  - Cause: same `getSession()` request-scope issue, causing 500 and `cookies` error instead of service-level behavior.

- `src/app/fleet/[slug]/page.test.tsx`
  - 1 failure expecting tab controls as `role="button"`.
  - Cause: tab controls now use `role="tab"` in current implementation.

## Suggested next actions

1. Update docker route tests to mock `@/lib/session#getSession` with a resolved user session (or refactor handlers to support explicit session injection in test context).
2. Replace the compose test `ShellExecutor` mock with a constructable function/class.
3. Update node detail test selectors from `button` role to `tab` role.
