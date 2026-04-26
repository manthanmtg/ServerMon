# Guidelines Sync Blocked by Disk UI Formatting

## Selected prompt

`prompts/project_guidelines_sync.md`

## What I checked

- Audited `CLAUDE.md` against `package.json`.
- Found that `CLAUDE.md` says `pnpm check` runs all mandatory checks, while `package.json`
  defines `pnpm check` as lint, typecheck, build, and test only.
- Made a small guideline correction locally, then ran `pnpm format:check && pnpm check`.

## Failure

`pnpm format:check` failed before `pnpm check` could run because Prettier reported
formatting issues in:

- `src/modules/disk/ui/DiskHardwareHealth.tsx`
- `src/modules/disk/ui/DiskPage.tsx`

## Why I held back

The selected prompt only permits changes to `CLAUDE.md`, `AGENTS.md`, or an issue note
created by this run. Formatting the disk UI files is outside that scope, and committing
the guideline change without passing the repository-required checks would violate the
prompt's verification rule.

## Proposed follow-up

Run a dedicated formatting cleanup for the disk UI files, then re-apply the guideline
correction so `CLAUDE.md` accurately states that `pnpm format:check` is separate from
`pnpm check`.
