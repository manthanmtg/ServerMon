# Architecture Refactoring Agent Prompt

## Objective

Select an overly complex or bloated component and decompose it into smaller, manageable, and highly focused sub-components.

## Philosophy

Monolithic components (God objects) stifle agility, mask bugs, and inhibit testing. Upholding the Single Responsibility Principle by breaking large structures down ensures a scalable, readable codebase.

## Workflow

### 1. Pick a Target

- Find a large UI component (e.g., > 500 lines or rendering massive nested DOM trees) in `src/modules/` or `src/app/`.

### 2. Audit (Plan Decomposition)

Check for these code smells:
- **Mixed Concerns**: Fetching data, managing complex local state, and rendering exhaustive UI in one file.
- **Prop Drilling**: Passing props 4-5 layers deep within nested render functions.
- **God Components**: A single file handling an entire feature domain's UI.

### 3. Fix (Small Scope)

- Extract **1–2 Sub-Components**. Don't rewrite the entire feature.
- Move extracted segments into a dedicated local `components/` folder.
- Export/Import them correctly, defining strict prop interfaces.

### 4. No-Op Conditions

- If the selected module already consists of beautifully isolated, small components, log "architecture is clean" and stop.
- If safe decomposition is impossible without a breaking logic rewrite, log the blocker to `issues_to_look/`.

### 5. Verify

- Run `pnpm check` and `pnpm test` to ensure functional parity and strict typing.

### 6. Commit

- Commit with a message like: `refactor(ui): extract list rendering logic from AdminView`

## Issue Management
- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
