# Build Verifier Prompt

## Objective

Ensure the ServerMon project builds cleanly from scratch with **zero errors and zero warnings**. Fix any issues that prevent a clean `pnpm build` or `pnpm check`.

## Philosophy

A broken build is the most fundamental regression — it means the app cannot deploy. This prompt acts as a circuit breaker, catching issues before they compound.

## Workflow

### 1. Run the Full Check

```bash
pnpm check
```

This runs lint, typecheck, build, and tests in sequence. If it passes cleanly, you're done — no-op.

### 2. Triage Failures

If `pnpm check` fails, identify the stage:

| Stage | Command | Common Issues |
|---|---|---|
| Lint | `pnpm lint` | Unused imports, `any` types, missing deps |
| Typecheck | `tsc --noEmit` | Type mismatches, missing properties |
| Build | `next build` | Import errors, missing modules, SSR issues |
| Test | `pnpm test` | Failing assertions (delegate to `test_corrector`) |

### 3. Fix (Minimal, Targeted)

- Fix **only what's needed** to make the build pass. No refactoring, no "while I'm here" changes.
- If a fix requires touching more than 3 files or changing more than 30 lines, log it to `issues_to_look/` instead.
- Common safe fixes:
  - Add missing imports/exports
  - Fix type annotations
  - Remove unused variables
  - Update stale references

### 4. Verify

- Run `pnpm check` again — must pass fully.
- If it still fails after your fix, revert and log to `issues_to_look/`.

### 5. Commit

- Commit with a message like: `fix(build): resolve type error in processes api route`
- Keep it factual and specific.
