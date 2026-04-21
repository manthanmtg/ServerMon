# AI Runner Fault Tolerance Plan

## Problem

- Current AI Runner execution is owned by the Next.js server process.
- If the web server restarts, live runs can become orphaned and scheduled runs stop being evaluated until the app comes back.
- TTY-backed runs are also tied closely to the process that launched them, so crash recovery is weak today.

## Solution

- Move AI Runner from an in-process executor to a durable, Mongo-backed job system.
- Treat the web app as a control plane only: it creates jobs, shows status, retries work, and cancels jobs.
- Run execution through a detached supervisor process that survives web restarts and is responsible for dispatching work.
- Run each command in a short-lived worker process so the worker can fail independently without taking down the API.
- Persist enough state in Mongo to recover after crashes: queue status, run status, heartbeat, retry count, last output offsets, and schedule checkpoints.
- Use a lease/heartbeat model so only one supervisor owns dispatching at a time.
- Use a stale-job recovery rule so interrupted jobs can be retried or marked failed based on their last known state.

## Planned Implementation

- Add a new durable job model for AI Runner work items with states like `queued`, `dispatched`, `running`, `retrying`, `completed`, `failed`, and `canceled`.
- Add heartbeat fields to detect stale runs and to distinguish an active worker from a crashed one.
- Add a supervisor entrypoint that:
- acquires a DB lease on startup
- replays missed schedules after downtime
- resumes queued or retryable jobs
- marks stale runs for retry or failure
- dispatches the next runnable job when capacity is available
- Add a worker entrypoint that:
- loads one job by id
- executes the command in either PTY or non-PTY mode
- writes stdout/stderr/raw output incrementally
- refreshes heartbeat and resource usage while running
- finalizes the run result back to Mongo on exit
- Add retry policy fields so transient failures can be retried automatically with a bounded number of attempts.
- Add startup recovery so any `running` job without a fresh heartbeat is reconciled when the supervisor comes back.
- Recovery rule: only consider a stale `running` job recoverable if it is still inside its timeout window; once the timeout window has passed, finalize it as `timeout` or `failed` instead of keeping it alive.
- Add schedule catch-up so the system can replay missed schedule windows once after restart without double-running the same window.
- Keep manual run, prompt, profile, and schedule APIs as the user-facing layer, but make them enqueue durable jobs instead of directly owning child processes.

## Notes

- This is a larger change because it touches the run schema, scheduler semantics, worker lifecycle, and recovery logic.
- It should be implemented in slices so existing manual runs and schedules keep working while the new durable path is introduced.
- The current direct-execution path is fine for a prototype, but it is not fault tolerant enough for crashes or host restarts.

## History Tab Plan

- The current History tab should become a rich audit console, not a simple run list.
- Use a table-first layout with strong density and scanability: `status`, `run name`, `prompt`, `profile`, `trigger`, `workspace`, `started`, `duration`, `exit code`, and `resource usage`.
- Add fast filters for `status`, `trigger`, `profile`, `schedule`, and text search so operators can narrow incidents quickly.
- Make each row clickable and open a large modal or drawer with the full run view.
- The run detail view should include `Summary`, `Output`, `Command`, `Metadata`, and `Resources` tabs or sections.
- The modal should expose actions like `Rerun`, `Retry`, `Kill`, `Open Prompt`, and `Open Schedule` where applicable.
- Use badges and severity coloring so failures, timeouts, and killed runs are immediately visible in the table.
- Keep the list compact and powerful, and move the heavier inspection into the modal so the page stays fast to scan.
