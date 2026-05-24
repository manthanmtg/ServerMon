# Remaining failing tests after Test Corrector run (5 fixed, 24 left)

Date: 2026-05-24
Prompt: `test-corrector`
Run slug: `auto/test-corrector-20260524-1145` (approx.)

## Summary
I fixed 5 small failing tests in this run and intentionally logged the remaining blockers for follow-up.

## Blockers to resolve

1. `src/modules/self-service/engine/compose-executor.test.ts`
   - 6 failures
   - vi.fn mocks reported as not using function/class implementations.

2. `src/app/fleet/[slug]/page.test.tsx`
   - 3 failures (`renders tabs and shows Overview by default`, `switches to Logs tab`, `switches to ServerMon tab`)
   - Likely UI semantics/label or tab rendering contract changed.

3. `src/app/fleet/[slug]/page.test.tsx`
   - repeated behavior tied to role/interaction expectations around tab controls.

4. `src/app/api/modules/docker/[containerId]/route.test.ts`
   - 3 failures
   - `getSession`/auth check currently causes request-context-specific cookie issue in this test setup.

5. `src/app/api/modules/docker/networks/[networkId]/route.test.ts`
   - 3 failures
   - Same cookie/request-context session failure and missing service-call assertions.

6. `src/app/api/modules/docker/volumes/[volumeName]/route.test.ts`
   - 3 failures
   - Same cookie/request-context session failure and missing service-call assertions.

7. `src/app/fleet/[slug]/page.test.tsx`
   - 1 additional failure tied to `GitHistoryModal` integration within fleet detail view (`findByRole('button', /view commit ... )`)

8. `src/app/api/fleet/install/route.test.ts`
   - 4 failures
   - Multiple status/error assertions failing around install script route responses.

## Proposed next fix approach
- Decide whether auth checks in these docker route handlers should consistently use request-bound session retrieval and apply the same fix across affected handlers.
- Align fleet page tests with current accessible role/label semantics.
- Update self-service compose test mocks so callbacks are wrapped with callable functions.
