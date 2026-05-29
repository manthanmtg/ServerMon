# API Resilience Improver Lint Blocker

**Date**: 2026-05-29
**Prompt**: api_resilience_improver.md

## Issue
I attempted to add `resilientFetch` to `src/modules/ai-agents/ui/useAgentsSnapshot.ts` to improve network resilience (adding timeouts and retries for polling). However, the `pnpm check` failed due to pre-existing lint errors in `main` (e.g. `react-hooks/rules-of-hooks` in `CommandSearch.tsx`, `react-hooks/immutability` in `HistoryView.tsx`).

## Proposed Fix
Fix the existing lint errors in the codebase so that autonomous agents can verify their changes without false negative check failures. The `api_resilience_improver.md` agent will hold back its changes until these blockers are addressed.
