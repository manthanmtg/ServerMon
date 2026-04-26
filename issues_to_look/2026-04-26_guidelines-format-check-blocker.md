# Guidelines sync blocked by repository formatting drift

## Context

- Selected prompt: `prompts/project_guidelines_sync.md`
- Intended update: adjust `CLAUDE.md` so the mandatory formatting check references `pnpm format:check`, because `package.json` defines `pnpm format` as a write command.
- Local doc-only checks passed after formatting `CLAUDE.md`:
  - `pnpm exec prettier --check CLAUDE.md AGENTS.md`
  - `git diff --check`

## Blocker

The broader repository formatting check failed before `pnpm check` could run:

```text
pnpm format:check
[warn] src/app/api/fleet/routes/[id]/route.test.ts
[warn] src/app/api/fleet/routes/route.test.ts
[warn] src/lib/fleet/frpOrchestrator.test.ts
[warn] src/modules/fleet/ui/details/terminal/types.ts
[warn] src/modules/processes/ui/ProcessWidget.tsx
Code style issues found in 5 files.
```

## Why this was not changed in this run

The selected prompt only permits changes to `CLAUDE.md`, `AGENTS.md`, or an issue note created by the run. Formatting unrelated source files would exceed that scope, so the `CLAUDE.md` edit was reverted and this blocker was logged instead.

## Proposed follow-up

Run Prettier on the five listed files in a dedicated formatting cleanup, then repeat the guidelines sync update.
