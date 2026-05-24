# Test Corrector: remaining failures after focused repair run

Run selected: `prompts/test_corrector.md` on `2026-05-24`.
I fixed 5 tests in this run and stopped per prompt limit.

Remaining failing tests:

- `src/modules/network/ui/NetworkWidget.test.tsx`
  - "does not parse failed HTTP responses"
  - "shows Network label when no data available"
- `src/modules/updates/ui/UpdateWidget.test.tsx`
  - "renders \"System Secure\" when there are no updates and no pending restart"
  - "renders updates and restart badges when present"
- `src/app/api/terminal/sessions/route.test.ts`
  - "returns sessions list"
  - "returns empty sessions"
  - "returns 500 on DB error"
- `src/app/api/terminal/settings/route.test.ts`
  - "clamps fontSize to min 10"
  - "clamps maxSessions to max 20"

These were not addressed this run to keep the scope to the maximum 5 small fixes.
