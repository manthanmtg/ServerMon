# Performance Tuner Prompt

## Objective

Find and fix **one performance issue** in the ServerMon codebase — unnecessary re-renders, missing memoization, heavy bundle imports, or inefficient data fetching.

## Philosophy

Performance is invisible when it's good and infuriating when it's bad. Each run makes one thing faster, smoother, or lighter. Over time, the app becomes noticeably snappier.

## Workflow

### 1. Pick a Target

Select one area to investigate:

- A module's UI component (look for re-render issues)
- A widget in `src/components/modules/` (look for unnecessary fetches)
- A shared component (look for missing `React.memo` or `useCallback`)
- An API route (look for unindexed queries or over-fetching)
- Bundle size (look for heavy imports that could be dynamic)

### 2. Check Runtime Context

You might already have the ServerMon process running, and the local fleet agent may be running too.

- If ServerMon is already running, use the live app to look for performance issues: slow pages, repeated requests, expensive renders, noisy polling, delayed interactions, or heavy logs.
- If the agent is also running, use it as part of the observation path where relevant: heartbeat behavior, endpoint execution, tunnel status updates, and agent-driven UI refreshes can expose real performance problems.
- If nothing is running, or runtime access is blocked, proceed with a static investigation through the code, tests, imports, data-fetching paths, and component render structure.
- Do not start or stop an existing ServerMon or agent process unless the task requires it; observe what is already available first.

### 3. Identify One Issue

Common performance problems:

- **Unnecessary re-renders**: State updates that rebuild the entire component tree. Fix with `React.memo`, `useMemo`, `useCallback`.
- **Missing code splitting**: Large libraries imported statically that should use `next/dynamic` or dynamic `import()`.
- **Redundant fetches**: Multiple components fetching the same data independently. Consider lifting the fetch.
- **Heavy computations in render**: Sorting, filtering, or formatting done on every render without memoization.
- **Unoptimized images**: Missing `next/image` usage, oversized assets.

### 4. Fix (One Issue Only)

- Make **one** targeted fix per run.
- The fix must be clearly an improvement with no behavioral change.
- If fixing requires restructuring a component, log it to `issues_to_look/` instead.

### 5. Verify

- Run `pnpm check` — zero regressions.
- If possible, verify the improvement is observable (faster load, fewer renders).

### 6. Commit

- Commit with a message like: `perf(terminal): memoize terminal output buffer`

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
