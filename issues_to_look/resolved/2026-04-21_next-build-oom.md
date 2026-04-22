# Random documentation sync blocked by Next.js build OOM

Selected prompt: `prompts/documentation_ghostwriter_prompt.md`

## What I intended to improve

Update `PRD.md` so the security/authentication sections match the current implementation:

- username + password login UI instead of HTTP Basic Auth
- TOTP verification during setup and password-based login
- optional WebAuthn passkey login and passkey management in Settings

## What blocked the change

The required repo verification failed before the documentation-only update could be kept.

Observed command:

```bash
pnpm check
```

Observed failure during `pnpm build`:

```text
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
Next.js build worker exited with code: null and signal: SIGABRT
```

The build reached:

- `next build`
- `Compiled successfully`
- `Running TypeScript ...`

and then aborted in the Next.js build worker due to Node heap exhaustion.

## Recommended follow-up

1. Reproduce the failure with `pnpm build` and capture whether the OOM is deterministic in this environment.
2. Increase build-time Node memory if this project now needs it during Next.js type analysis.
3. If memory usage regressed recently, identify the offending change before retrying random prompt runs that require `pnpm check`.

## Why I stopped

`prompts/random_selector.md` requires reverting the change and logging an issue when verification fails. I reverted the `PRD.md` edit and kept the workspace limited to this issue entry.
