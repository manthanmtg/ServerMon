# Format Check Fails On Existing Files

## Selected prompt

`prompts/test_corrector.md`

## What happened

`pnpm test` passed with 584 test files and 4,633 tests passing, so the test-corrector prompt had no failing tests to repair.

The required follow-up verification failed at `pnpm format:check` before `pnpm check` could run:

- `src/components/layout/commandSearchUtils.test.ts`
- `src/modules/file-browser/ui/components/FileBrowserEntryActions.tsx`
- `src/modules/processes/ui/ProcessWidget.tsx`

## Proposed fix

Run Prettier on the listed files, review the formatting-only diff, then rerun `pnpm format:check` and `pnpm check`.

## Why I held back

The selected prompt is repair-only for currently failing tests. Since the suite passed and the format failures are unrelated to test repair, changing those files would widen the scope beyond this autonomous prompt run.
