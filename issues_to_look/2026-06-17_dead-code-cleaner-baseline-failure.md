# Dead Code Cleaner Baseline Failure

During the run on 2026-06-17, the Dead Code Cleaner agent successfully found unused exports and removed them. However, when verifying the changes with `pnpm check`, the `typecheck` step failed with 45 errors across 14 files.

These errors appear to be preexisting baseline failures rather than errors caused by the removed exports, as the failed files (mostly test files like `src/app/api/modules/ai-runner/_shared.test.ts`, `src/lib/auth-utils.test.ts`, `src/modules/self-service/engine/compose-executor.test.ts`) were not modified and the type errors are unrelated to the exported types/schemas that were un-exported.

Due to the strict safety constraints ("If any check fails, revert your changes, log the failure in issues_to_look/, and stop"), the changes have been reverted and this run is marked as a failure.

## Sample of type errors
```
src/app/api/modules/ai-runner/_shared.test.ts:33:56 - error TS2345: Argument of type 'Response' is not assignable to parameter of type 'NextResponse<unknown>'.
src/lib/services/service.test.ts:51:7 - error TS2345: Argument of type '(command: string, args: readonly string[] | null | undefined, _options: ExecFileOptions | null | undefined, callback?: ExecFileCallback | undefined) => never' is not assignable to parameter of type '(file: string, args: readonly string[] | null | undefined, options: ExecFileOptions | null | undefined, callback: ((error: ExecFileException | null, stdout: string | NonSharedBuffer, stderr: string | NonSharedBuffer) => void) | null | undefined) => ChildProcess'.
```