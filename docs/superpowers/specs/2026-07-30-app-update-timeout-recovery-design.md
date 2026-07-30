# App Update Timeout and Recovery Design

## Overview

Managed Git app updates currently persist a `running` operation before executing
Git and deployment work. That state correctly prevents duplicate updates, but it
has no deadline or recovery path. If ServerMon exits or an update hangs before a
terminal status is saved, the operation remains `running` indefinitely, the UI
keeps showing a spinner, and both the UI and backend reject future updates.

Add a fixed one-hour update deadline, cancellation of live timed-out work, and
automatic reconciliation of abandoned operation records. Timed-out or
interrupted operations remain in history as failed records with an explicit
reason; they are never silently deleted.

## Goals

- A managed app update cannot remain `running` for more than one hour.
- A live update that reaches the deadline is stopped before its lock is released.
- Persisted stale records are reconciled automatically after startup and during
  scheduler operation.
- A timed-out operation is preserved as `failed`, with `completedAt` and a clear
  timeout error.
- Fresh running operations continue to block overlapping manual and automatic
  updates.
- Legacy running records created before this change are recoverable.

## Non-Goals

- User-configurable per-app update timeouts.
- Resuming a partially completed update after a ServerMon restart.
- Converting the synchronous Apps workflow into a detached job queue.
- Changing deploy, rollback, or release-history behavior beyond what is needed
  to safely cancel an update.

## Operation State Contract

Update operations receive a persisted `deadlineAt` timestamp set to one hour
after `startedAt`. The one-hour duration is a named server-side constant so the
backend, reconciliation logic, and tests use one value.

An update operation may transition from `running` to exactly one terminal
status: `succeeded`, `failed`, or `unchanged`. Terminal writes use a
compare-and-set condition requiring the stored status to still be `running`.
This prevents a late callback from overwriting a timeout failure.

Legacy running operations without `deadlineAt` are stale when `startedAt` is
older than one hour. Reconciliation marks stale operations:

- `status`: `failed`
- `step`: `Update timed out`
- `completedAt`: reconciliation time
- `error`: `Update timed out after 1 hour`
- logs: append the same timeout explanation without discarding existing logs

The history entry remains visible so an operator can see what happened.

## Live Timeout and Cancellation

`updateManagedGitApp()` creates an operation-scoped `AbortController` and a
deadline timer. The optional abort signal is threaded through Git preparation,
deployment commands, health checks, retry waits, and progress handling.

When the one-hour timer expires:

1. Abort the currently running child command and wait for it to exit.
2. Let the deployment helper execute its existing rollback path when the active
   symlink or service had already changed.
3. Atomically transition the operation to `failed` with the timeout reason.
4. Preserve the previous active release and app runtime status.
5. Clear the operation timer in a `finally` block.

Command cancellation must terminate the shell command tree, not only reject the
JavaScript promise. This prevents a build or system command from continuing
after the operation lock is released.

Non-timeout errors follow the same terminal-state guarantee: after an operation
is created, every caught failure attempts an atomic `running -> failed`
transition before the original error is returned or rethrown.

## Stale Record Reconciliation

Add an Apps service operation that atomically marks expired running operations
as failed. It handles both new `deadlineAt` records and legacy records using the
one-hour `startedAt` fallback.

Reconciliation runs:

1. During ServerMon startup before the Git app auto-update scheduler performs
   its first update tick.
2. Before each scheduled Git app auto-update scan.
3. Immediately before acquiring the exclusive lock for a manual or automatic
   update.

The third boundary ensures an expired lock cannot cause a `409` even if a
scheduled reconciliation pass was delayed. Reconciliation is idempotent and
only changes operations still stored as `running`.

## UI Behavior

The UI continues to derive its loading state from persisted operation status.
No client-only unlock is added. Once reconciliation changes the record to
`failed`, the existing Apps polling reloads the record, removes the spinner, and
enables Update. This keeps the browser and backend consistent and avoids
allowing overlapping work based only on a local clock.

The expanded Operations panel shows the failed timeout entry and its retained
logs. No operation is removed from history.

## Files and Components

- `src/modules/apps/types.ts`
  - Add the optional persisted update deadline to the operation contract.
- `src/models/ManagedApp.ts`
  - Store `deadlineAt` on operation subdocuments.
- `src/lib/apps/deploy.ts`
  - Accept an optional abort signal and terminate command trees safely.
  - Make health-check waits and Certbot retry waits abort-aware.
- `src/lib/apps/git.ts`
  - Propagate the operation abort signal through Git commands.
- `src/lib/apps/service.ts`
  - Set update deadlines, enforce the live timeout, make terminal transitions
    atomic, and expose stale-operation reconciliation.
- `src/lib/apps/auto-update.ts`
  - Reconcile stale records before scheduled update discovery.
- `src/server.ts`
  - Reconcile stale records before starting the Git app auto-update scheduler.
- `src/lib/apps/service.update.test.ts`
  - Cover deadline creation, timeout failure, stale legacy recovery, and atomic
    terminal transitions.
- `src/lib/apps/deploy.test.ts` and `src/lib/apps/git.test.ts`
  - Cover abort propagation, command termination, and rollback behavior.
- `src/lib/apps/auto-update.test.ts`
  - Verify reconciliation runs before due-app discovery.
- `src/modules/apps/ui/AppsPage.test.tsx`
  - Verify Update is enabled after the API returns a reconciled failed
    operation.

## Error Handling and Observability

- Log the app ID, operation ID, deadline, and reconciliation count without
  logging environment variables or repository credentials.
- Distinguish `Update timed out after 1 hour` from Git, build, deployment, and
  health-check failures.
- If startup reconciliation fails because MongoDB is unavailable, log the
  failure and allow normal server startup. The pre-update reconciliation
  boundary remains the final safety check before a new update starts.
- If rollback after cancellation fails, retain both the timeout and rollback
  failure context in the operation logs and keep the operation terminal.

## Testing Strategy

Follow test-driven development with focused regression cases:

1. A running operation older than one hour is marked failed and retains logs.
2. A fresh running operation remains running and continues to block duplicates.
3. A legacy operation without `deadlineAt` is reconciled using `startedAt`.
4. Reconciliation is idempotent and does not change terminal operations.
5. An update operation is created with a one-hour deadline.
6. A live update exceeding its deadline aborts its command and ends failed.
7. A late success callback cannot overwrite a timeout failure.
8. Startup and scheduled auto-update flows reconcile before scanning due apps.
9. The Apps UI enables Update after the API returns the reconciled failed
   operation.

Run focused Apps tests during development, then the project-required format,
release-contract, lint, typecheck, build, and full test commands before
completion.

## Rollout and Recovery

Deploying this change restarts ServerMon. At startup, existing running update
records older than one hour are marked failed, so the currently stuck app cards
unlock without deleting history or requiring a direct database edit.

Rollback is code-only: the added operation field is optional, and older code
ignores it. Reconciled failure records use statuses already supported by the
existing schema and UI.
