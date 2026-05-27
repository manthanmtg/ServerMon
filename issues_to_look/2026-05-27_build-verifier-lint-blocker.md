# Build verification blocked by widespread lint errors

## Issue

`prompts/build_verifier.md` run on this pass failed required verification with `pnpm check`.
The following lint errors were reported:

- `src/app/api/modules/disk/scan/route.test.ts`: 'json' unused
- `src/components/layout/CommandSearch.tsx`: conditional hook calls
- `src/modules/ai-runner/ui/components/HistoryView.tsx`: modifying `historyRowRefs.current` ref arguments directly
- `src/modules/ai-runner/ui/components/RunDetailDrawer.tsx`: synchronous setState inside useEffect
- `src/modules/crons/ui/CronsPage.tsx`: missing hook dependencies
- `src/modules/endpoints/ui/components/TemplateGallery.tsx`: function accessed before declared
- `src/modules/health/ui/HealthWidget.tsx`: synchronous setState inside useEffect
- `src/modules/ports/ui/PortAvailabilityChecker.tsx`: missing hook dependencies
- `src/modules/security/ui/SecurityScoreOverview.tsx`: 'Lock' unused
- `src/modules/services/ui/ServicesPage.tsx`: 'CardContent' unused

## Why this run was held back

This run was not safe for a single, narrow autonomous slice:
- Fixing these issues requires touching 10 different files, which violates the `build_verifier` rule: "If a fix requires touching more than 3 files or changing more than 30 lines, log it to `issues_to_look/` instead."
- A minimal single-file fix would not satisfy a green `pnpm check` result.

## Proposed follow-up

- Resolve lint errors across these 10 files using a dedicated lint-cleanup prompt.
- Re-run `pnpm check` to verify all errors are cleanly resolved.
