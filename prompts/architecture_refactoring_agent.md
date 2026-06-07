---
id: architecture-refactoring-agent
title: Architecture Refactoring Agent Prompt
category: code-quality
enabled: true
autonomousSafe: true
---

# Architecture Refactoring Agent Prompt

## Objective

Select an overly complex or bloated component and decompose it into smaller, manageable, and highly focused sub-components.

## Philosophy

Monolithic components (God objects) stifle agility, mask bugs, and inhibit testing. Upholding the Single Responsibility Principle by breaking large structures down ensures a scalable, readable codebase.

## Workflow

### 1. Preflight

- Read `CLAUDE.md` first and follow the project conventions.
- Check `git status -sb` before editing. Leave unrelated changes untouched and stage only files changed by this run.
- Search `issues_to_look/` for existing architecture or component decomposition notes. If the same issue is already recorded, no-op instead of duplicating it.

### 2. Pick a Target

- Find a large UI component (e.g., > 500 lines or rendering massive nested DOM trees) in `src/modules/` or `src/app/`.
- Prefer a component with an obvious, reviewable extraction boundary such as a repeated section, table, list, or summary panel.

### 3. Audit (Plan Decomposition)

Check for these code smells:

- **Mixed Concerns**: Fetching data, managing complex local state, and rendering exhaustive UI in one file.
- **Prop Drilling**: Passing props 4-5 layers deep within nested render functions.
- **God Components**: A single file handling an entire feature domain's UI.

### 4. Fix (Small Scope)

- Extract **1–2 Sub-Components**. Don't rewrite the entire feature.
- Keep the new component beside the original file or in the module's existing local component folder; do not create a new folder unless that pattern already exists nearby.
- Export/Import them correctly, defining strict prop interfaces.

### 5. No-Op Conditions

- If the selected module already consists of beautifully isolated, small components, log "architecture is clean" and stop.
- If safe decomposition is impossible without a breaking logic rewrite, log the blocker to `issues_to_look/`.
- If the smallest useful extraction would touch more than one feature area, no-op and leave a note in `issues_to_look/`.

### 6. Verify

- Run `pnpm check` and `pnpm test` to ensure functional parity and strict typing.

### 7. Commit

- Commit with a message like: `refactor(ui): extract list rendering logic from AdminView`

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
