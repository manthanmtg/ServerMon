# Test Corrector: remaining failures after second repair run

Run selected: `prompts/test_corrector.md` on `2026-05-24`.
This run fixed 1 focused test suite and updated `prompts/prompts_metadata.json`.

Remaining failing tests after the repair:

- `src/lib/ai-runner/execution-wrapper.test.ts`
- `src/app/fleet/[slug]/page.test.tsx` (3)
- `src/modules/network/ui/NetworkWidget.test.tsx` (3)
- `src/modules/self-service/engine/compose-executor.test.ts` (6)
- `src/modules/updates/ui/UpdateWidget.test.tsx` (2)
- `src/app/api/terminal/sessions/route.test.ts` (3)
- `src/app/api/terminal/settings/route.test.ts` (2)
- `src/app/api/modules/docker/images/[imageId]/route.test.ts` (3)

Total remaining failures recorded: 22.

These were intentionally left unresolved to stay within the prompt's target scope.
