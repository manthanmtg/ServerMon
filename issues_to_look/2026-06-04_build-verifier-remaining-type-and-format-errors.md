# Build Verifier Remaining Issues (2026-06-04)

## Summary
While critical lint errors have been resolved, several pre-existing issues still prevent a clean `pnpm check`.

## Remaining Issues

### 1. TypeScript Errors (45 errors in 14 files)
Most of these are in test files, particularly in the `ai-runner` module. Many involve `Request` vs `NextRequest` mismatches or missing properties in mock objects.

**Key files with type errors:**
- `src/app/api/modules/ai-runner/profiles/[id]/lock/route.test.ts`
- `src/app/api/modules/ai-runner/profiles/validate/route.test.ts`
- `src/app/api/modules/ai-runner/prompt-templates/route.test.ts`
- `src/lib/ai-runner/worker-entry.test.ts`
- `src/modules/self-service/engine/compose-executor.test.ts`

### 2. Formatting Drift (91 files)
`pnpm format:check` fails due to formatting drift in 91 files. Running `pnpm format` would resolve this but would result in a very large commit.

## Recommendation
A dedicated run should address the type errors in tests, possibly by updating the mock helpers to properly support `NextRequest`. A separate run or a manual cleanup should be done for project-wide formatting.
