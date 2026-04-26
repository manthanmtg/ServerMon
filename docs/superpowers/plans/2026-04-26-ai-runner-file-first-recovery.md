# AI Runner File-First Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI Runner executions file-first and recoverable so running jobs can continue best-effort while ServerMon is down, then be reconciled when ServerMon returns.

**Architecture:** Add a durable artifact store under a configurable data directory, launch AI commands through a wrapper that writes stdout/stderr/exit metadata to files, and change supervisor recovery from stale-heartbeat-kill to inspect-and-reconcile. MongoDB remains the queue/control-plane store and no longer owns full output for new runs.

**Tech Stack:** Next.js App Router, TypeScript, Mongoose, Node child_process/fs APIs, Vitest.

---

## File Structure

- Create `src/lib/ai-runner/artifact-store.ts`: path resolution, run folder creation, metadata/exit reads and writes, log tailing, retention cleanup.
- Create `src/lib/ai-runner/artifact-store.test.ts`: focused artifact tests with temporary directories.
- Create `src/lib/ai-runner/execution-wrapper.ts`: CLI entrypoint that runs the actual command and writes artifact files.
- Modify `src/lib/ai-runner/execution.ts`: durable execution launch, liveness inspection, termination helpers.
- Modify `src/lib/ai-runner/worker.ts`: create artifacts, launch durable wrapper, tail files into small Mongo snapshots, finalize from `exit.json`.
- Modify `src/lib/ai-runner/supervisor.ts`: recover stale jobs by inspecting exit files and live process state before retry/fail.
- Modify `src/lib/ai-runner/settings.ts`, `src/models/AIRunnerSettings.ts`, `src/lib/ai-runner/schemas.ts`, `src/modules/ai-runner/types.ts`: artifact directory and retention settings.
- Modify `src/models/AIRunnerJob.ts`, `src/models/AIRunnerRun.ts`, `src/lib/ai-runner/shared.ts`: artifact and recovery fields.
- Modify run APIs and UI detail drawer to tail output from artifacts.
- Extend tests in `execution.test.ts`, `worker.test.ts` if present, `supervisor.test.ts`, `service.test.ts`, and settings/API tests.

## Task 1: Artifact Store

**Files:**
- Create: `src/lib/ai-runner/artifact-store.ts`
- Create: `src/lib/ai-runner/artifact-store.test.ts`
- Modify: `src/modules/ai-runner/types.ts`

- [ ] **Step 1: Add artifact DTO types**

Add `AIRunnerArtifactPathsDTO`, `AIRunnerArtifactOutputDTO`, `AIRunnerExecutionExitDTO`, and `AIRunnerExecutionMetadataDTO` to `src/modules/ai-runner/types.ts`.

- [ ] **Step 2: Write artifact store tests**

Cover directory creation, metadata write/read, exit write/read, missing/malformed exit handling, log appends/tails, and retention cleanup that skips active run ids.

- [ ] **Step 3: Implement artifact store**

Implement `getDefaultAIRunnerArtifactBaseDir()`, `resolveAIRunnerArtifactPaths()`, `ensureAIRunnerArtifactDir()`, `writeAIRunnerMetadata()`, `readAIRunnerMetadata()`, `readAIRunnerExit()`, `tailAIRunnerArtifactOutput()`, and `cleanupAIRunnerArtifacts()`.

- [ ] **Step 4: Run artifact tests**

Run: `pnpm vitest src/lib/ai-runner/artifact-store.test.ts`

Expected: PASS.

## Task 2: Settings And Models

**Files:**
- Modify: `src/models/AIRunnerSettings.ts`
- Modify: `src/lib/ai-runner/settings.ts`
- Modify: `src/lib/ai-runner/schemas.ts`
- Modify: `src/modules/ai-runner/types.ts`
- Modify: `src/models/AIRunnerJob.ts`
- Modify: `src/models/AIRunnerRun.ts`
- Modify: `src/lib/ai-runner/shared.ts`
- Modify: `src/lib/ai-runner/settings.test.ts`

- [ ] **Step 1: Write settings tests**

Add expectations that default settings include artifact base dir, Mongo retention days, and artifact retention days. Add update tests for valid retention values and invalid schema tests for negative values.

- [ ] **Step 2: Add settings fields**

Add `artifactBaseDir`, `mongoRetentionDays`, and `artifactRetentionDays` to the model, DTO, mapper, and PATCH schema.

- [ ] **Step 3: Add run/job artifact fields**

Add artifact path fields, `executionRef`, `recoveryState`, and `lastRecoveryError` to `AIRunnerJob` and `AIRunnerRun`. Update `mapRun()` to include artifact/recovery fields.

- [ ] **Step 4: Run model/settings tests**

Run: `pnpm vitest src/lib/ai-runner/settings.test.ts src/modules/ai-runner/types.test.ts`

Expected: PASS.

## Task 3: Durable Execution Wrapper

**Files:**
- Create: `src/lib/ai-runner/execution-wrapper.ts`
- Modify: `src/lib/ai-runner/execution.ts`
- Modify: `src/lib/ai-runner/execution.test.ts`

- [ ] **Step 1: Write execution tests**

Add tests that durable execution launches the wrapper with artifact paths, local fallback stores child pid/process group, and liveness returns true for a live pid and false for missing refs.

- [ ] **Step 2: Implement wrapper**

The wrapper reads a JSON launch file path from argv, appends stdout/stderr/combined logs, writes `metadata.json`, and writes `exit.json` with exit code, signal, startedAt, finishedAt, and duration.

- [ ] **Step 3: Implement durable launch helpers**

Add `spawnDurableAIRunnerCommand()`, `isAIRunnerExecutionAlive()`, and keep `terminateAIRunnerExecution()` compatible with pid and systemd unit refs.

- [ ] **Step 4: Run execution tests**

Run: `pnpm vitest src/lib/ai-runner/execution.test.ts`

Expected: PASS.

## Task 4: Worker File-First Output

**Files:**
- Modify: `src/lib/ai-runner/worker.ts`
- Modify: `src/lib/ai-runner/worker-entry.ts`
- Modify: `src/lib/ai-runner/worker.test.ts` if added, otherwise add coverage through existing execution/supervisor tests.

- [ ] **Step 1: Write worker behavior tests**

Cover starting a job creates artifact metadata, persists artifact fields to Mongo, tails output files into capped Mongo snapshots, and finalizes from `exit.json`.

- [ ] **Step 2: Replace direct command spawn**

Worker uses artifact store + durable execution launch instead of piping direct child stdout/stderr as the only output source.

- [ ] **Step 3: Keep Mongo output small**

Worker writes capped tail snapshots to `stdout`, `stderr`, and `rawOutput` for compatibility only. Full output remains in files.

- [ ] **Step 4: Run worker-related tests**

Run: `pnpm vitest src/lib/ai-runner/execution.test.ts src/lib/ai-runner/supervisor.test.ts`

Expected: PASS.

## Task 5: Supervisor Recovery And Retention

**Files:**
- Modify: `src/lib/ai-runner/supervisor.ts`
- Modify: `src/lib/ai-runner/supervisor.test.ts`

- [ ] **Step 1: Write recovery tests**

Cover stale alive execution, successful exit marker, failed exit marker with retry, no marker/no process, timeout recovery kill, cancellation kill, and blocking workspace conflict.

- [ ] **Step 2: Implement inspect-before-retry recovery**

Replace stale-job immediate termination with artifact/exit/liveness inspection. Only terminate for timeout, cancellation, or blocking conflicts.

- [ ] **Step 3: Add cleanup tick**

Supervisor cleanup removes terminal Mongo records older than `mongoRetentionDays` and artifact folders older than `artifactRetentionDays`, skipping active run ids.

- [ ] **Step 4: Run supervisor tests**

Run: `pnpm vitest src/lib/ai-runner/supervisor.test.ts`

Expected: PASS.

## Task 6: Output APIs And UI

**Files:**
- Modify: `src/lib/ai-runner/service.ts`
- Modify: `src/app/api/modules/ai-runner/runs/[runId]/route.ts`
- Modify: `src/modules/ai-runner/ui/components/RunDetailDrawer.tsx`
- Modify: `src/modules/ai-runner/ui/components/RunDetailDrawer.test.tsx`
- Modify: `src/modules/ai-runner/ui/AIRunnerPage.test.tsx`

- [ ] **Step 1: Add output tail service method**

Add `getRunOutput(runId)` that tails artifact files and falls back to legacy Mongo output for old runs without artifacts.

- [ ] **Step 2: Return file-tail output in run detail**

`getRun()` or the run detail API should include `stdout`, `stderr`, and `rawOutput` from artifact tails for new runs.

- [ ] **Step 3: Update drawer copy**

Show artifact path/recovery state in metadata and keep output display backed by file-tail values.

- [ ] **Step 4: Run UI/API tests**

Run: `pnpm vitest src/modules/ai-runner/ui/components/RunDetailDrawer.test.tsx src/modules/ai-runner/ui/AIRunnerPage.test.tsx`

Expected: PASS.

## Task 7: Verification

**Files:**
- Modify as required by failures only.

- [ ] **Step 1: Run focused AI Runner tests**

Run: `pnpm vitest src/lib/ai-runner src/modules/ai-runner src/app/api/modules/ai-runner`

Expected: PASS.

- [ ] **Step 2: Run repo checks**

Run: `pnpm check`

Expected: PASS.

- [ ] **Step 3: Manual smoke test**

Start ServerMon, queue a short AI Runner custom profile command, confirm artifact files are created, restart ServerMon, and confirm run detail still reads output from files.
