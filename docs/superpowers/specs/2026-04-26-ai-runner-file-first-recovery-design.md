# AI Runner File-First Recovery Design

## Context

AI Runner already stores runs and jobs in MongoDB and uses a detached supervisor/worker path to dispatch work. That makes queued work durable, but running jobs still depend too much on the observer process. When ServerMon restarts, worker heartbeats can go stale and the supervisor currently treats that as a retry/failure signal instead of first proving whether the underlying AI command is still alive.

The goal is to make AI Runner execution survive ServerMon downtime on a best-effort basis. ServerMon should observe and enforce policy when it is running, but the actual AI command should continue while ServerMon is unavailable. When ServerMon starts again, it should inspect the execution, reconcile MongoDB state, and immediately apply timeout, cancellation, and workspace-blocking rules.

## Goals

- Let active AI Runner commands continue when ServerMon web/supervisor processes restart.
- Keep full execution artifacts on disk instead of storing large logs in MongoDB.
- Make run history output tail from artifact files.
- Reconcile MongoDB state from disk artifacts and live process checks after restart.
- Keep MongoDB clean with configurable retention.
- Keep behavior cross-platform by relying on a shared file-first execution contract.

## Non-Goals

- Do not introduce a separate AI Runner daemon in the first implementation.
- Do not make systemd or launchd the primary cross-platform source of truth.
- Do not auto-import orphaned artifact folders as new runs in the first version.
- Do not preserve full stdout/stderr in MongoDB for new runs.

## Architecture

The existing queue, supervisor, and worker architecture remains. A new durable run artifact layer becomes the source of truth for execution output and recovery evidence.

Each run gets a folder under a configurable AI Runner data directory:

```text
<ai-runner-data-dir>/runs/<runId>/
```

The folder contains the full execution record:

- `metadata.json` with launch details such as run id, job id, workspace, command, environment reference metadata, and timestamps.
- `stdout.log` with complete stdout.
- `stderr.log` with complete stderr.
- `combined.log` with best-effort interleaved output. If exact stdout/stderr ordering cannot be preserved on a platform, entries include stream labels and write timestamps.
- `exit.json` with authoritative normal completion details when the wrapper exits cleanly.
- `wrapper.log` with launch and recovery diagnostics.

MongoDB remains the control-plane database. It stores queue state, run/job status, profile/workspace/prompt references, timestamps, process references, retention settings, and small UI metadata. It should not be the source of truth for full logs.

The key boundary is:

> The job execution can continue without ServerMon; ServerMon is the observer and policy enforcer when present.

## Data Flow

Run creation remains the same from the user perspective. Manual runs, schedules, and AutoFlows still create MongoDB run and job records. Dispatch additionally assigns or verifies a durable artifact directory before execution begins.

1. The API queues a run in MongoDB.
2. The supervisor dispatches a queued job.
3. The worker creates or verifies the run artifact folder.
4. The worker writes `metadata.json`.
5. The worker launches a small cross-platform wrapper process.
6. The wrapper starts the actual AI command.
7. Command stdout and stderr stream to files in the run folder.
8. The wrapper writes `exit.json` when the command finishes normally from the wrapper's point of view.
9. While alive, the worker tails files and updates MongoDB status and timestamps.
10. History and run detail APIs read output tails from files, not MongoDB output blobs.

When ServerMon is down, the command continues and logs keep going to disk. MongoDB does not need live output updates during that time.

When ServerMon returns, the supervisor scans active MongoDB jobs, reads artifact metadata and exit markers, checks live execution when no valid exit marker exists, applies policy, and updates MongoDB to match reality.

## Recovery Rules

Recovery runs on startup and during stale-job reconciliation.

1. Read active MongoDB jobs. Active means `queued`, `dispatched`, `running`, or `retrying`.
2. For `dispatched` and `running` jobs, inspect the artifact folder.
3. If the artifact folder is missing, check the process state before retrying or failing. The command may still be alive even if artifacts were deleted.
4. If `exit.json` exists and is valid, treat it as authoritative. Exit code `0` completes the run. Non-zero exit codes fail or retry according to the existing attempt policy.
5. If `exit.json` is missing, check live execution through the stored process id, process group, or execution unit. If alive, mark or reaffirm the job as `running`.
6. Apply policy immediately after recovery inspection:
   - If the alive job is past its timeout, terminate it and mark the run `timeout`.
   - If cancellation was requested, terminate it and mark the run/job canceled.
   - If multiple executions are alive in a blocking workspace, MongoDB's intended active job wins and conflicting executions are canceled.
7. If no live execution exists and no valid exit marker exists, mark the run as an uncertain recovery failure. If attempts remain, move it to `retrying`; otherwise mark it `failed` with a clear recovery error.
8. `queued` and `retrying` jobs do not need execution recovery. They remain dispatchable unless blocked by a recovered running job.

ServerMon must not kill a job merely because the worker heartbeat is stale. It only terminates after proving a policy violation, cancellation, timeout, or blocking conflict.

## Settings And Retention

AI Runner settings should include storage and retention controls:

- `Run artifact directory`: the base directory for run folders. It must be writable by the ServerMon service user.
- `Mongo run retention days`: age-based cleanup for MongoDB run/job records. Active records are never deleted until they resolve, even if they exceed the configured age.
- `Artifact retention days`: separate age-based cleanup for run folders. Active or recovering run folders are never deleted.

Default artifact directory should be platform-aware:

- Linux production: `/var/lib/servermon/ai-runner`
- macOS and local development fallback: `~/.servermon/ai-runner`

Cleanup runs from the supervisor loop, not request handlers. Cleanup logs what it deletes and skips all active/recovering runs.

Maximum artifact disk usage enforcement is deferred and is not part of the first implementation.

## Components

### `artifact-store.ts`

Owns run directory paths, directory creation, metadata reads/writes, exit marker reads, log tailing, and retention cleanup.

### Execution Wrapper

A small script or entrypoint launches the actual AI command, redirects stdout/stderr to files, records process references, and writes `exit.json` on completion.

### `execution.ts`

Keeps platform-specific launch, liveness, termination, and status inspection helpers. It should expose durable execution operations rather than requiring the worker to know platform details.

### `worker.ts`

Becomes an observer around durable execution. It starts execution, tails files while alive, updates MongoDB, and finalizes from `exit.json`.

### `supervisor.ts`

Owns recovery and policy enforcement. Stale-job reconciliation changes from kill/retry-first to inspect/recover-first.

### AI Runner APIs

Run history and detail output endpoints tail artifacts. They should handle missing files with clear empty/error states.

### Models And Settings

Add these artifact and execution metadata fields to AI Runner run/job records:

- `artifactDir`
- `stdoutPath`
- `stderrPath`
- `combinedPath`
- `exitPath`
- `executionRef`
- `recoveryState`
- `lastRecoveryError`

Prefer diagnostic fields over adding many public statuses. Existing user-facing statuses remain the primary status model.

## Error Handling

- If artifact directory creation fails before launch, fail the job without starting the AI command.
- If `metadata.json` exists but MongoDB is missing or stale, expose it only through artifact diagnostics and do not auto-import it as a new run in the first version.
- If `exit.json` is malformed, fall back to process inspection.
- If the process is gone and the exit marker is missing or malformed, mark the run as failed or retrying with a recovery uncertainty error.
- If log files are missing but the process is alive, keep the job running and surface a warning.
- If termination fails during timeout, cancellation, or blocking recovery, record `termination_failed` diagnostics and retry termination on later ticks.
- If the artifact directory is deleted while a job is active, check process state before retrying or failing.
- If workspace-blocking recovery finds conflicts, MongoDB's intended active job wins.

## Testing

Artifact store tests:

- Creates per-run folders.
- Writes and reads metadata.
- Reads valid `exit.json`.
- Handles missing and malformed files.
- Tails stdout and stderr safely.
- Retention cleanup skips active run ids.

Execution wrapper tests:

- Writes `exit.json` on success.
- Writes non-zero exit code on failure.
- Redirects stdout and stderr to files.
- Preserves working directory and environment.

Supervisor recovery tests:

- Stale heartbeat with alive process stays running.
- Stale heartbeat with successful `exit.json` completes.
- Stale heartbeat with failed `exit.json` retries when attempts remain.
- Stale heartbeat with no process and no marker becomes uncertain failure or retry.
- Alive but timed-out execution is terminated and marked timeout.
- Cancellation request terminates and cancels execution.
- Blocking workspace conflict keeps MongoDB's intended active job and cancels conflicts.

API/UI tests:

- Run detail output tails from artifact files.
- Missing artifact files return clear empty or error states.
- Settings updates validate artifact directory and retention values.

## Rollout

1. Add artifact directory and retention settings.
2. Add the artifact store and wrapper.
3. Switch new jobs to file-first execution.
4. Add recovery logic to the supervisor.
5. Switch history and detail output to tail artifacts.
6. Keep old MongoDB output fields temporarily for old runs.
7. Add cleanup for old MongoDB records and artifact folders.

This rollout can happen incrementally without introducing a separate daemon immediately.
