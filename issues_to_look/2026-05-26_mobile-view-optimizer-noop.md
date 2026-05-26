# Mobile View Optimizer blocked by pre-existing lint errors

## Issue

The `prompts/mobile_view_optimizer.md` run identified that the "View all" links in `DatabasesWidget.tsx` and `SelfServiceWidget.tsx` did not meet the 44px minimum target size rule.

However, the required `pnpm check` failed with multiple lint errors in pre-existing files (e.g., `src/components/layout/CommandSearch.tsx`, `src/modules/endpoints/ui/components/TemplateGallery.tsx`).

## Why this run was held back

As per the No-Op Protocol, if the verification (`pnpm check`) fails, the changes must be reverted and logged. Since the errors were pre-existing and widespread, the fix cannot be safely committed in this run.

## Proposed follow-up

- Resolve the pre-existing lint errors in `src/components/layout/CommandSearch.tsx`, `src/modules/endpoints/ui/components/TemplateGallery.tsx`, etc.
- Re-run the mobile view optimizer to fix the touch targets.