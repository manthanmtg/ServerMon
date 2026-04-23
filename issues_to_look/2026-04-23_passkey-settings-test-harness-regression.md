# Passkey settings resilience run blocked by React test harness regression

Selected prompt: `prompts/api_resilience_improver.md`

Selected file: `src/modules/security/ui/PasskeySettings.tsx`

## What I intended to improve

Harden the passkey settings network flow with a small, safe resilience pass:

- add request timeouts so passkey list/register/delete calls cannot hang indefinitely
- validate passkey list and registration options payloads before trusting `res.json()`

## What blocked the change

Verification failed before the resilience patch itself could be validated. Running:

```bash
pnpm vitest src/modules/security/ui/PasskeySettings.test.tsx
```

immediately failed on render/cleanup with:

```text
TypeError: React.act is not a function
```

The stack comes from `@testing-library/react` falling through to `react-dom/test-utils` during `render()` and `cleanup()`. That means even a narrow client-side resilience patch in `PasskeySettings` cannot be verified under the repo's required test flow.

## Why I stopped

`prompts/random_selector.md` requires reverting the code change and stopping when verification fails. Fixing the shared React/Vitest compatibility layer is broader than one small API resilience slice, so I reverted the exploratory code changes and logged the blocker instead.

## Recommended follow-up

1. Reconfirm the intended React 19 + Testing Library compatibility path in the shared Vitest setup.
2. Fix the shared `act` integration once centrally instead of working around it per test file.
3. Retry the passkey resilience improvement after `pnpm vitest src/modules/security/ui/PasskeySettings.test.tsx` can render successfully.
