# Mobile View Optimizer Prompt

## Objective

Find and fix one mobile usability issue in ServerMon while preserving desktop behavior and the existing design system.

## Scope

Pick one small, user-facing surface:

- a dashboard or module component
- a widget in `src/components/modules/`
- a shared layout, header, navigation, or action bar
- a loading, empty, or error state visible on small screens

Optimize one issue only.

## Mobile Checklist

- Prevent horizontal overflow and clipped controls.
- Keep interactive targets at least 44px where practical.
- Make tables, dense rows, badges, and action groups wrap or stack cleanly.
- Preserve scanability for status, metrics, logs, and server controls.
- Keep hover, focus, disabled, and active states intact.
- Use semantic CSS variables and existing component classes from `src/app/globals.css`.

## Workflow

### 1. Audit

Read `CLAUDE.md`, check `git status -sb`, and inspect one target for mobile layout risk. Use static review unless ServerMon is already running.

### 2. Fix One Thing

Make the smallest safe change that improves mobile view without a broad redesign, new dependency, or server-side behavior change.

### 3. No-Op Conditions

Log an issue in `issues_to_look/` and stop if:

- the target is already mobile-safe
- the fix requires restructuring a component or flow
- mobile behavior cannot be verified safely
- an existing issue note already covers the same problem

### 4. Verify

- Run the applicable non-server verification from `CLAUDE.md`, preferably `pnpm check`.
- Run `git diff --check`.
- Do not start the ServerMon server locally unless a human explicitly asks.

### 5. Commit

Use a message like `fix(ui): improve mobile server card layout`.

## Issue Management

Move resolved issue notes into `issues_to_look/resolved/`.
