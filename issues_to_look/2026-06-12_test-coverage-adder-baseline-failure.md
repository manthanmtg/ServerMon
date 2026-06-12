# Baseline Checks Failing for test_coverage_adder

**Date**: 2026-06-12
**Prompt**: `test_coverage_adder.md`

## Issue

The `pnpm test` and `pnpm check` commands are currently failing on `main`. 

`pnpm test` has ~30 failing test files out-of-the-box (e.g. `src/lib/fleet/backup.test.ts`, `src/models/Node.test.ts`, `src/lib/ai-runner/logs.test.ts`) primarily due to mock configuration issues with `node:` core modules not being correctly set up in the Vitest environment. 

`pnpm typecheck` also fails with 45 errors in 14 files related to type mismatch in mocks and responses.

## Action Taken

The `test_coverage_adder` successfully added a new test for `src/app/api/fleet/nodes/[id]/servermon/restart/route.ts` which passed individually. However, due to the project's strict verified-commit policy ("all tests (old + new) must pass" and "If any check fails, revert your changes..."), the change was reverted.

## Next Steps

A separate agent (like `build_verifier` or `test_corrector`) needs to fix the baseline typescript and test failures on `main` before `test_coverage_adder` can successfully commit new tests.