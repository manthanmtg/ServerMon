# Accessibility Improver Prompt

## Objective

Pick one random page or component and improve its accessibility (a11y). Make ServerMon usable by everyone, one small fix at a time.

## Philosophy

Accessibility is not a feature — it's a quality. Small, consistent improvements (an aria-label here, a focus ring there) add up to a dramatically better experience for all users, including those using keyboards, screen readers, or high-contrast modes.

## Workflow

### 1. Pick a Target

- Select a random module's page UI or a page in `src/app/`.
- Or pick a shared component from `src/components/`.

### 2. Audit (Pick 1–3 Issues)

Check for these common gaps:

- **Missing labels**: `<button>` or `<input>` without `aria-label` or associated `<label>`.
- **Missing alt text**: `<img>` tags without meaningful `alt` attributes.
- **Focus management**: Interactive elements that aren't keyboard-reachable or have no visible focus indicator.
- **Color contrast**: Text that doesn't meet WCAG AA contrast ratios against its background.
- **Semantic HTML**: `<div>` used where `<nav>`, `<main>`, `<section>`, `<article>`, or `<aside>` would be more appropriate.
- **ARIA roles**: Modals without `role="dialog"`, lists without proper list roles.

### 3. Fix (Small Scope)

- Fix **1–3 issues** per run. Don't try to make the whole app accessible in one pass.
- Each fix should be self-contained and obvious.

### 4. No-Op Conditions

- If the target component already has solid a11y, pick another. If 3 checks come back clean, log "a11y looks good" and stop.
- If fixing an issue requires a structural refactor, log it to `issues_to_look/`.

### 5. Verify

- Run `pnpm check` to ensure no regressions.
- If the app is running, manually verify keyboard navigation works on the changed component.

### 6. Commit

- Commit with a message like: `a11y(processes): add aria-labels to process actions`

## Issue Management
- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
