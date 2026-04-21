# Users widget enhancement blocked by React test harness mismatch

Selected prompt: `prompts/random_module_enhancer_prompt.md`

## What I intended to improve

Make the `src/modules/users/ui/UsersWidget.tsx` dashboard widget safer and more polished by:

- replacing hardcoded widget colors with semantic theme tokens
- adding an explicit loading state
- adding an explicit error state when one of the user stats requests fails

## What blocked the change

The repo-level Vitest setup currently fails on a simple React Testing Library `render()` call under the current dependency set:

- `react@19.2.3`
- `react-dom@19.2.3`
- `@testing-library/react@16.3.2`

Observed failure while validating the widget test:

```text
TypeError: React.act is not a function
```

The failure comes from `react-dom/test-utils` calling `React.act(...)`, but this React build does not expose `act`. That means even a small widget-only UI improvement cannot be safely verified with the mandatory `pnpm test` / `pnpm check` flow.

## Recommended follow-up

Pick one of these before retrying widget-level React changes:

1. Align the test stack so Testing Library and React agree on `act` support.
2. Add a repo-approved Vitest compatibility shim for `react-dom/test-utils`.
3. If the current versions are intentional, document the supported testing pattern and update the shared test setup once, centrally.

## Why I stopped

`prompts/random_selector.md` requires a no-op when the change cannot be verified safely or when the fix would spill beyond one small module slice. Repairing the shared React test harness is broader than a single module enhancement, so I reverted the exploratory code changes and logged this issue instead.
