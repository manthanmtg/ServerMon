---
id: build-verifier
title: Build Verifier Prompt
category: verification
enabled: true
autonomousSafe: true
---

# Build Verifier Prompt

## Objective

Ensure the ServerMon project completes its required verification commands successfully. Fix formatting errors, lint failures, type errors, test failures, or build failures that make `pnpm format:check` or `pnpm check` exit non-zero.

## Philosophy

A broken build is the most fundamental regression — it means the app cannot deploy. This prompt acts as a circuit breaker, catching issues before they compound.

## Workflow

### 1. Run the Full Check

```bash
pnpm format:check
pnpm check
```

This checks formatting first, then runs lint, typecheck, build, and tests in sequence. If both commands exit successfully, you're done — no-op unless the output includes a narrowly scoped lint/build warning that can be fixed safely in this run.

### 2. Triage Failures

If either command fails, identify the stage:

| Stage     | Command             | Common Issues                                     |
| --------- | ------------------- | ------------------------------------------------- |
| Format    | `pnpm format:check` | Prettier formatting drift                         |
| Lint      | `pnpm lint`         | Unused imports, `any` types, missing deps         |
| Typecheck | `tsc --noEmit`      | Type mismatches, missing properties               |
| Build     | `next build`        | Import errors, missing modules, SSR issues        |
| Test      | `pnpm test`         | Failing assertions (delegate to `test_corrector`) |

Runtime warning noise emitted by passing tests is not a build-verifier failure by itself. If the suite passes but warning cleanup would span unrelated components, leave it for a dedicated warning-cleanup issue instead of expanding this run.

### 3. Fix (Minimal, Targeted)

- Fix **only what's needed** to make the build pass. No refactoring, no "while I'm here" changes.
- If a fix requires touching more than 3 files or changing more than 30 lines, log it to `issues_to_look/` instead.
- Common safe fixes:
  - Add missing imports/exports
  - Fix type annotations
  - Remove unused variables
  - Update stale references

### 4. Verify

- Run `pnpm format:check` and `pnpm check` again — both must pass fully.
- If it still fails after your fix, revert and log to `issues_to_look/`.

### 5. Commit

- Commit with a message like: `fix(build): resolve type error in processes api route`
- Keep it factual and specific.

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
