# State Management Optimizer Prompt

## Objective

Analyze and optimize a targeted React component to eliminate unnecessary re-renders cascading across the DOM tree.

## Philosophy

Performance is part of the user experience. 60 FPS interfaces require disciplined state updates, aggressive reference-equality management (`useMemo`/`useCallback`), and localized UI state.

## Workflow

### 1. Pick a Target

- Select a complex, heavily interactive module in `src/modules/` or a widely used shared `src/components/`.

### 2. Audit (Performance Gaps)

Look for:

- **Cascading Re-renders**: Global state accessed in parent components forcing re-renders on isolated children.
- **Unstable References**: Callbacks passed to memoized children without `useCallback`.
- **Expensive Computations**: Inline filtering/sorting of massive arrays on every render cycle without `useMemo`.
- **Overused State**: Values assigned to `useState` that don't actually require a DOM update (should be `useRef`).

### 3. Fix (Small Scope)

- Wrap **1–2 expensive operations** in `useMemo` or `useCallback`.
- Convert non-visual state to `useRef`.
- Colocate nested states into unified reducers if batching is failing.

### 4. No-Op Conditions

- If the component relies purely on primitive props and doesn't trigger waste renders, log "state optimally managed" and stop.
- If fixing performance requires ripping out the Global Context entirely, log the blocker to `issues_to_look/`.

### 5. Verify

- Ensure UI interactions (e.g. typing in an input, dragging, sorting) still behave perfectly without glitches.
- Run `pnpm check` to confirm hooks dependency arrays are correct.

### 6. Commit

- Commit with a message like: `perf(ui): memoize data filtering in HistoryWidget`

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
