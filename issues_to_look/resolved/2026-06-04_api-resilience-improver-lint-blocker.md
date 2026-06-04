# API Resilience Improver Lint Blocker

## Issue
Attempted to run the `api_resilience_improver` prompt to harden `src/app/fleet/routes/[id]/page.tsx` by replacing native `fetch` with `resilientFetch` to add timeouts and retry logic. However, the `pnpm check` failed due to pre-existing lint errors in the codebase:
- `src/components/layout/CommandSearch.tsx`: react-hooks/rules-of-hooks
- `src/modules/ai-runner/ui/components/HistoryView.tsx`: react-hooks/immutability
- `src/modules/ai-runner/ui/components/RunDetailDrawer.tsx`: react-hooks/set-state-in-effect
- `src/modules/health/ui/HealthWidget.tsx`: react-hooks/set-state-in-effect
- `src/modules/services/ui/ServicesPage.tsx`: @typescript-eslint/no-explicit-any

## Proposed Fix
Fix the pre-existing lint errors across the codebase so that autonomous agents can confidently verify their changes using `pnpm check`.

## Action Taken
Reverted the resilience improvement and stopped execution as per the No-Op / Verify protocol.
