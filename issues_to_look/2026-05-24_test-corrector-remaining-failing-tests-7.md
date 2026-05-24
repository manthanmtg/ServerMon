# Remaining failing tests after Test Corrector run (5 fixed)

Date: 2026-05-24
Prompt: `test-corrector`
Run slug: `auto/test-corrector-20260524-1206`

## Summary
I fixed the first five failing tests in this run. The following blockers still fail and should be handled in the next `test_corrector` cycle.

## Blockers to resolve

1. `src/modules/self-service/engine/compose-executor.test.ts`
   - 6 failures
   - `vi.fn` mocks are expected to be called as functions/class instances in several callback assertions.

2. `src/app/api/modules/docker/networks/[networkId]/route.test.ts`
   - 3 failures
   - Session/cookie mocking and service expectation assertions still fail under the current test harness setup.

3. `src/app/api/modules/docker/volumes/[volumeName]/route.test.ts`
   - 3 failures
   - Same auth/session mocking gap as the docker network tests.

4. `src/modules/file-browser/ui/components/GitHistoryModal.test.tsx`
   - 2 failures
   - Mocked `fetch`/`history` path and `onClose` callback usage need further alignment.

5. `src/app/fleet/install/route.test.ts`
   - 4 failures
   - Status/error assertion contract around the install endpoint responses remains outdated for current behavior.

