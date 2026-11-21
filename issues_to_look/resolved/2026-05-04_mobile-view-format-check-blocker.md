# Mobile View Optimizer Format Check Blocker

## Selected prompt

`prompts/mobile_view_optimizer.md`

## What I attempted

- Audited `src/modules/docker/ui/components/DockerTerminal.tsx` for a small mobile usability issue.
- Added a focused regression test proving the Docker terminal preset buttons were below the 44px mobile touch target guidance.
- Updated those preset buttons to use `h-11` on mobile while preserving `sm:h-8` for wider viewports.
- Confirmed the targeted Docker page test passed after the change.

## Verification blocker

`pnpm format:check` failed on an unrelated existing file:

- `src/app/api/fleet/import/route.ts`

The selected prompt requires reverting changes and logging the failure when verification fails, so the Docker terminal touch-target change was reverted.

## Proposed follow-up

1. Run Prettier on `src/app/api/fleet/import/route.ts` or otherwise normalize its formatting.
2. Re-run `pnpm format:check`.
3. Re-apply the Docker terminal mobile touch-target change in a fresh mobile-view run.
