# Type Safety Enforcer Check Blocker

**Date**: 2026-06-02
**Prompt**: type_safety_enforcer.md

## Issue
I attempted to fix weak typing (`as any`) in `src/modules/services/ui/ServicesPage.tsx` by introducing and using the strongly typed `ServicesCpuHistoryPoint` interface from `ServicesChartsPanel.tsx`. However, running `pnpm check` failed due to dozens of preexisting type errors and lint errors across the codebase.

## Proposed Fix
Fix the existing type errors and lint errors in the codebase so that autonomous agents can verify their changes without false negative check failures. The `type_safety_enforcer.md` agent will hold back its changes until these blockers are addressed.