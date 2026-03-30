# Random Module Enhancer Prompt

## Objective

Pick one module from `src/modules/` and improve it — cleaner code, better types, and refined UI/UX.

## Workflow

### 1. Audit
- Pick a module directory.
- Identify monolithic files, `any` types, or missing loading states.
- Find opportunities for "smart" features (e.g., sparklines for metrics, quick actions in the process list).

### 2. Refactor
- **De-monolith**: Break large files into smaller components in the `ui/` subfolder.
- **Tighten Types**: Replace any remaining `any` or `unknown` (where possible) with strict interfaces.
- **Render Purity**: Ensure components are pure; move side effects to hooks or service layers.

### 3. Improve UI
- **Density**: Ensure the UI is compact and professional.
- **Responsiveness**: Verify the module works perfectly on mobile (no horizontal scroll, large enough touch targets).
- **Style**: Use the semantic theme tokens defined in `globals.css`.

### 4. Verify
- Run `pnpm check` to ensure no regressions in linting, types, or build.
- Add Vitest unit tests if the module lacks coverage for core logic.

## Principles
- **Incremental Improvement**: Don't rewrite from scratch unless necessary.
- **No Regressions**: Maintain all existing functionality.
- **Standardized**: Follow the checklists in `CLAUDE.md`.
