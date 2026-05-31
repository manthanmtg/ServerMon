# State Management Optimizer Lint Blocker

**Date**: 2026-05-31
**Prompt**: state_management_optimizer.md

## Issue
I attempted to fix a cascading re-render in `src/modules/docker/ui/components/ContainerTable.tsx` by extracting the container row logic into a `React.memo`-wrapped `ContainerRow` component. However, the `pnpm check` failed due to pre-existing lint errors in `main` (e.g., `react-hooks/rules-of-hooks` in `CommandSearch.tsx`, `react-hooks/immutability` in `HistoryView.tsx`).

## Proposed Fix
Fix the existing lint errors in the codebase so that autonomous agents can verify their changes without false negative check failures. The `state_management_optimizer.md` agent will hold back its changes until these blockers are addressed.
