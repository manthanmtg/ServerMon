# Test Corrector: remaining failures after focused repair

Run selected: `prompts/test_corrector.md` on `2026-05-24`.

I fixed 5 tests in this run (terminal sessions GET auth checks and terminal settings request validation expectations).
All remaining failing tests are now tracked separately:

- `src/modules/self-service/engine/compose-executor.test.ts`
  - returns failure when required compose content is missing
  - returns failure when compose directory is missing
  - writes compose file and succeeds when shell execution succeeds
  - surfaces shell executor failure and keeps collected logs
  - returns a default error message when shell execution throws a non-Error
  - invokes shell executor instance with expected command arguments
- `src/modules/network/ui/NetworkWidget.test.tsx`
  - shows Network label when no data available
  - handles failed HTTP responses
  - does not parse failed HTTP responses
- `src/modules/updates/ui/UpdateWidget.test.tsx`
  - renders \"System Secure\" when there are no updates and no pending restart
  - renders updates and restart badges when present
- `src/app/api/modules/docker/images/[imageId]/route.test.ts`
  - removes an image successfully
  - passes correct imageId to service
  - returns 500 on service error
