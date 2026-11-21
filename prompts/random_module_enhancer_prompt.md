---
id: random-module-enhancer-prompt
title: Random Module Enhancer Prompt
category: feature-quality
enabled: true
autonomousSafe: true
---

# Random Module Enhancer Prompt

## Objective

Pick one module from `src/modules/` and improve existing behavior — cleaner code, better types, and refined UI/UX.

## Workflow

### 1. Audit

- Pick a module directory.
- Identify monolithic files, `any` types, or missing loading states.
- Find opportunities to polish existing behavior, such as clearer loading states, tighter empty states, or safer action feedback.

### 2. Refactor

- **De-monolith**: Break large files into smaller components in the `ui/` subfolder.
- **Tighten Types**: Replace any remaining `any` or `unknown` (where possible) with strict interfaces.
- **Render Purity**: Ensure components are pure; move side effects to hooks or service layers.

### 3. Improve UI

- **Density**: Ensure the UI is compact and professional.
- **Responsiveness**: Verify the module works perfectly on mobile (no horizontal scroll, large enough touch targets).
- **Style**: Use the semantic theme tokens defined in `globals.css`.
- **Existing Scope**: Do not add new product capabilities; leave feature ideas for a human-selected prompt or issue note.

### 4. Verify

- Run `pnpm format:check`, then `pnpm check` to cover the release contract, lint, types, build, and tests.
- Add or update focused Vitest tests only when the selected slice changes core logic or behavior. Leave broader coverage gaps for `test_coverage_adder.md` or an `issues_to_look/` note.

## Scope Guardrail

**One small slice per run.** Do NOT rewrite an entire module in a single pass. Pick the **one weakest aspect** (e.g., one messy component, one missing loading state, one bad mobile layout) and fix that. The module gets better over many runs, not one.

## No-Op Protocol

Before making changes, ask:

1. Is this module already in good shape? (Clean types, good UI, responsive, tested)
2. Would my change touch more than ~100 lines of diff?
3. Am I unsure whether this change is safe?

If yes to any of these, **do NOT change code.** Instead, log what you found and what you'd recommend in `issues_to_look/YYYY-MM-DD_<module-slug>.md` and stop.

## Principles

- **Incremental Improvement**: Don't rewrite from scratch unless necessary.
- **No Regressions**: Maintain all existing functionality.
- **Standardized**: Follow the checklists in `CLAUDE.md`.

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
