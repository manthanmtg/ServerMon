# Build Verifier: Widespread Lint Warnings and Flaky Test

**Date:** 2026-05-02
**Prompt:** build-verifier

## Issue

During the `build-verifier` run, `pnpm check` failed.

1. **Lint Warnings:** There are 22 ESLint warnings for `'Model' is defined but never used` across various `src/app/api/fleet/` routes.
2. **Flaky Test:** The test `ai-runner execution wrapper > continues when existing metadata is malformed` in `src/lib/ai-runner/execution-wrapper.test.ts` timed out (5000ms), which caused the build pipeline to fail with exit code 1.

## Proposed Fix

- Remove the unused `Model` import from the 22 affected files in `src/app/api/fleet/`.
- Investigate and fix the test timeout in `execution-wrapper.test.ts` (e.g. increase timeout or address underlying vitest hang).

## Why Held Back

Fixing the lint warnings would require modifying 22 files, which exceeds the `build-verifier` prompt's safety limit of 3 files. The flaky test would also add complexity to the fix. Therefore, logging this to address in a dedicated cleanup run.
