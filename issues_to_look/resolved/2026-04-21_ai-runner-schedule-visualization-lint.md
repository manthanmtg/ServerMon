# AI Runner Schedule Visualization Lint Failure

## Summary

`pnpm check` currently fails on `main` because ESLint reports `react-hooks/set-state-in-effect` in `src/modules/ai-runner/ui/components/ScheduleVisualizationModal.tsx`.

## Failure

- File: `src/modules/ai-runner/ui/components/ScheduleVisualizationModal.tsx`
- Line: `73`
- Current code:

```tsx
useEffect(() => {
  if (isOpen) {
    setMode('workspace');
  }
}, [isOpen]);
```

- Lint error: calling `setMode('workspace')` synchronously inside an effect triggers `react-hooks/set-state-in-effect`

## Proposed Fix

Refactor the modal so the initial mode resets without a synchronous state update inside `useEffect`. Safe options include:

- deriving the displayed mode from `isOpen` plus local state
- resetting mode in the open/close event path instead of an effect
- remounting the modal content with a key when it opens

## Why This Run Stopped

The randomly selected prompt was `prompts/documentation_ghostwriter_prompt.md`. A README sync change was prepared, but `pnpm check` failed on this pre-existing lint error. Per `prompts/random_selector.md`, the documentation change was reverted and the run stopped after logging the blocker.
