# Apps Auto-update Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Enabled Git apps reliably attempt scheduled updates, recover from failures, and explain their current state without requiring users to inspect server logs.

**Architecture:** The supervised Apps worker owns scheduling and execution. Scheduled and manual updates share durable operations, per-app exclusion, deadlines, and operation history. Persist scheduler observations separately from Git-check and deployment outcomes; determine changes against the successfully deployed commit.

**Tech Stack:** Existing TypeScript, Mongoose/MongoDB, Next.js, React, Vitest and Playwright; no new runtime dependencies.

**Spec:** The behavior and acceptance criteria in this document implement the September 6 user report: auto-update appears never to attempt an update and its state is unclear.

## Global constraints

- Planning only in this change; implementation and deployment are subsequent work.
- Follow `CLAUDE.md`; use pnpm and existing logging, authentication, theme tokens and API conventions.
- Preserve unrelated working-tree changes, including the Network test file.
- Linux remains the supported host-mutation environment.
- Do not describe repository findings as proof of the deployed server's failure cause.
- No Git credentials, environment values, or authenticated remote URLs in diagnostics.
- Preserve the existing worker-unavailable rejection contract for manual mutations.
- Use the existing durable operation collection and unique active-operation index, not a second deployment queue.

## Evidence and investigation boundary

Verified in the current checkout:

- `src/server.ts` starts the scheduler only through custom-server startup and only when startup jobs are enabled.
- `auto-update-scheduler.ts` polls every minute, runs a startup scan and has an overdue watchdog, but keeps its health only in process memory/logs.
- `auto-update.ts` invokes `updateManagedGitApp` directly, bypassing `enqueueAppOperation` and worker readiness.
- Enabling Daily currently sets the first deadline to now plus 1,440 minutes. Saving unrelated settings replaces auto-update state and postpones the deadline again.
- `git.ts` resets the checkout before deployment. `service.ts` treats unchanged checkout plus an existing release as success even after a prior deployment failure.
- `worker/runner.ts` detects lost ownership but its executor receives no abort signal. Fenced finalization alone does not stop an already running host command.
- The four focused scheduler, runner, Git and service test files passed 27 tests during investigation. They do not cover the complete failure/retry sequence or demonstrate production scheduler liveness.

Unverified: the deployed revision, process launch mode, startup-job flag, database schedule, worker status and recent logs. Do not assume any one is the reported incident's root cause.

## Product behavior

1. Enabling schedules the first check immediately; subsequent successful checks occur at the selected interval measured from completion. Daily means every 24 hours, not midnight. Tell the user this next to the control.
2. Saving unrelated fields preserves all schedule/history fields. An interval change sets the next check from the last completed check plus the new interval, clamped to now. A branch/repository change schedules an immediate check and invalidates remote observations.
3. Disabling cancels automatic operations still queued, without interrupting an already executing deployment. Manual updates remain available. Guard the worker's automatic claim against disabled or superseded schedule generations.
4. A downtime backlog produces one catch-up operation per app, not one for each missed interval.
5. `Check for updates now` explicitly checks and deploys changes using the same queue, bypassing the wait and automatic retry backoff. Existing manual Update behavior may be relabeled; do not create a redundant endpoint.
6. Show separate timestamps for scheduler scan, actual Git attempt and successful deployment. A queued operation is never labeled as a completed check.
7. An unavailable worker or overdue scheduler gets a visible reason and recovery instruction. Never display `Up to date` without comparing upstream to a known deployed commit.
8. An unchanged failed candidate is retried according to policy; it must not clear the previous deployment failure as `unchanged`.
9. A manual rollback pauses auto-update, retaining the interval and showing `Paused after rollback — enable to resume`. Otherwise the next scheduled check would undo the rollback. Preserve this pause against late automatic completion writes.

## State and interfaces

Extend `ManagedApp.autoUpdate` additively; keep old fields available to compatibility DTOs during migration:

```ts
type AutoUpdateBlockReason =
  | 'worker_unavailable'
  | 'scheduler_stale'
  | 'operation_active'
  | 'retry_backoff'
  | 'disabled'
  | 'paused_after_rollback';

interface AutoUpdateRuntimeState {
  scheduleGeneration: number;
  lastAttemptAt?: Date;
  lastCheckCompletedAt?: Date;
  lastSuccessfulDeployAt?: Date;
  lastOperationId?: string;
  lastScheduledFor?: Date;
  consecutiveFailures: number;
  retryAt?: Date;
  observedRemoteSha?: string;
  pauseReason?: 'rollback';
}

interface AutoUpdateOperationMetadata {
  trigger: 'auto' | 'manual';
  scheduledFor?: Date;
  scheduleGeneration?: number;
}
```

Add commit identity to release records and an explicit deployed commit field on the app. Never migrate `gitCurrentSha` directly into the deployed field: it can identify a failed checkout. Recover from the active release's successful operation where possible; otherwise mark identity unknown and perform one reconciliation deployment when enabled. UI says `Deployed version unknown` until resolved.

Add scheduler heartbeat fields to `AppsWorkerHeartbeat`: last scan start, last scan completion, last successful scan, sanitized last error and scan counters. Worker heartbeat alone does not prove scheduler progress. Include fresh scheduler and worker health in the existing Apps snapshot API, with server time; no unauthenticated diagnostic endpoint.

New pure functions in `src/lib/apps/domain/auto-update-policy.ts`:

```ts
nextRetryAt(failedAt: Date, consecutiveFailures: number, intervalMinutes: number): Date
shouldDeployCommit(remoteSha: string, deployedSha?: string): boolean
```

Retries after successive failures: 1, 5, 15 and 60 minutes, capped at the configured interval; after the fourth retry, use the normal interval. Count failure once per terminal operation, not once per polling tick. Manual checks can bypass this wait. Authentication/missing branch errors use the normal interval immediately, with a visible configuration error; configuration edits permit immediate retry.

## Task 1: Capture why attempts are missing and establish diagnostics

**Files:** `src/models/AppsWorkerHeartbeat.ts`, `src/lib/apps/repositories/worker-heartbeat-repository.ts`, `src/lib/apps/auto-update-scheduler.ts`, `src/lib/apps/service.ts`, `src/modules/apps/types.ts`; their colocated tests.

- [ ] Gather read-only production evidence when access exists: deployed revision, launch command, startup flag, worker service state, sanitized scheduler logs, app enabled/next-run/last-run fields, and active operations. Record evidence in the implementation report. Missing production access does not block repository hardening.
- [ ] Add persisted scan timestamps and error/counter fields and expose worker/scheduler health through the authenticated Apps snapshot.
- [ ] Test that a worker with fresh heartbeats but no completed scheduler scan is reported as scheduler-stale after two polling intervals plus a 30-second allowance. During initial startup report `starting`, not healthy.
- [ ] Test missing/stale worker, scheduler error and database snapshot failure. API failure must show unavailable state; stale UI data must not remain green.
- [ ] Return timestamp evidence even when no apps are due; zero due apps is a successful scan.

**Deliverable:** Users and operators can distinguish no scheduled work, missing scheduler, blocked worker and failed checks.

## Task 2: Preserve settings and define scheduling/retry policy

**Files:** `src/models/ManagedApp.ts`, `src/modules/apps/types.ts`, `src/lib/apps/service.ts`; create `src/lib/apps/domain/auto-update-policy.ts` and `.test.ts`; extend `service.test.ts`.

- [ ] Add the schema fields and pure policy functions above. Add a due-query index matching enabled Git app scans after inspecting the resulting query plan.
- [ ] Replace whole-object auto-update replacement with field updates. Increment schedule generation only when disabling/enabling, changing interval/source, or pausing for rollback.
- [ ] Test enable-at-noon schedules noon, unrelated name edits retain the prior deadline and history, shorter interval catches up immediately, disabling prevents future automatic work, and enabling again checks immediately.
- [ ] Test exact retry times with a fixed clock:

```ts
expect(nextRetryAt(new Date('2026-09-06T12:00:00Z'), 1, 1440)).toEqual(
  new Date('2026-09-06T12:01:00Z')
);
expect(shouldDeployCommit('new', 'old')).toBe(true);
expect(shouldDeployCommit('new', 'new')).toBe(false);
expect(shouldDeployCommit('new', undefined)).toBe(true);
```

- [ ] Use compare-and-set updates keyed by operation ID and schedule generation for scheduler completion fields. A completed old operation must not re-enable updates or overwrite a user's new schedule.

**Deliverable:** Settings have predictable behavior and repeated edits cannot silently postpone work.

## Task 3: Route automatic attempts through durable worker operations

**Files:** `src/lib/apps/auto-update.ts`, `auto-update-scheduler.ts`, `application/enqueue-operation.ts`, `repositories/operation-repository.ts`, `src/models/AppOperation.ts`, `src/workers/apps-worker.ts`, `src/server.ts`, `worker/legacy-executor.ts`; associated tests.

- [ ] Extend enqueue, persisted operation and claimed-operation types with `AutoUpdateOperationMetadata`; manual defaults remain manual. Persist metadata as explicit fields, not title parsing.
- [ ] Move scheduler lifecycle to worker startup after its running heartbeat succeeds. Stop scheduling before worker draining. Remove the web-server scheduler and legacy stale-update scan startup paths once worker recovery owns them.
- [ ] Replace direct execution in `runDueGitAppAutoUpdates` with enqueue calls; report `queued`, `busy`, `blocked`, and `failedToQueue` counts instead of claiming updates completed.
- [ ] Use stable per-occurrence keys:

```ts
const idempotencyKey = `auto:${appId}:${scheduleGeneration}:${scheduledFor.toISOString()}`;
```

- [ ] Keep the due occurrence until enqueue is known durable. Recover an enqueue-before-schedule-write crash by finding the same idempotency key. Reconcile terminal results before allocating a retry occurrence so a terminal key does not leave an app stuck forever.
- [ ] Reuse the unique active-operation index for conflicts with deploy/update/rollback/delete. Busy is a deferral, not a failed Git attempt. Scan in bounded oldest-due-first batches with a rotating cursor; busy apps must not starve later apps.
- [ ] On claim, verify the app exists, is enabled for automatic work and still matches the operation generation. Cancel obsolete queued automatic work before Git commands. Honor the captured config or reject a stale config; never silently use a different branch.
- [ ] Test two schedulers racing, restart immediately after enqueue, unavailable worker, active rollback, disabled queued app, deleted app, legacy missing/null next-run date, backlog catch-up and scan fairness.
- [ ] Project terminal operation results idempotently into auto-update state. Reconcile terminal-but-unprojected operations after crashes; existing durable operation ID is the source of truth.

**Deliverable:** Every attempted automatic update has a durable operation and survives web-server restart without duplicate deployment.

## Task 4: Compare against the deployed commit and make retries safe

**Files:** `src/lib/apps/git.ts`, `service.ts`, `deploy.ts`, `worker/legacy-executor.ts`, `worker/runner.ts`, `repositories/operation-repository.ts`, `src/models/ManagedApp.ts`; focused Git, deployment, worker and service tests.

- [ ] Fetch the configured branch into an explicit ref and use the fetched commit as the immutable candidate. Avoid a separate `ls-remote` observation that can race the fetch, and avoid assuming a single-branch clone already tracks a newly selected branch.
- [ ] Compare candidate SHA with successfully deployed SHA. Set deployed SHA only after activation and health verification. Record candidate SHA and error on failed operations while preserving the active release identity.
- [ ] Add the critical two-attempt regression: deployed A, remote B, deployment B fails; remote remains B; next attempt deploys B again and succeeds. Also test unchanged successful B skips deployment and unknown legacy identity reconciles once.
- [ ] Restore deployed commit metadata during rollback and apply the automatic pause described above.
- [ ] Pass an AbortSignal and ownership assertion through runner, legacy executor, service, Git and deployment command execution. Cancel process groups on deadline/lease loss; check ownership before release activation, routing changes and final writes.
- [ ] Bound lease-renewal database errors by the last confirmed lease expiry. After expiry, abort instead of continuing host mutation indefinitely. Do not claim fencing alone makes external system commands transactional.
- [ ] Before recovery permits another deployment, establish that the old executor has stopped. If this cannot be established, leave a visible recovery-required failure rather than overlap host mutations. Audit existing recovery logic with this requirement.
- [ ] Test restart during build, timeout, lease loss during build, failed lease renewal past expiry, and recovery after activation but before final status save. Reconcile the active release manifest before deciding whether another deployment is necessary.

**Deliverable:** Failed candidates remain eligible, the active commit is truthful, and worker ownership loss cannot silently continue deployment.

## Task 5: Make every state understandable in Apps

**Files:** `src/modules/apps/ui/AppsPage.tsx`, `AppsPage.test.tsx`, `src/modules/apps/ui/components/AppsOperationLogsDialog.tsx`, `src/modules/apps/types.ts`, `src/app/api/modules/apps/[id]/update/route.ts` and route tests. Extract a focused `AutoUpdateStatus.tsx` component with colocated tests if needed.

- [ ] Display enabled interval, next check with absolute/relative time, actual last attempt, last successful check, last successful deployment, deployed/observed short SHAs, latest outcome and linked operation logs.
- [ ] Distinguish `Scheduled`, `Queued`, `Checking`, `Deploying`, `Up to date`, `Retry scheduled`, `Blocked`, `Disabled`, and `Paused after rollback`. `Up to date` is historical evidence with its timestamp, not a promise about the current remote.
- [ ] Above the app list, show missing worker or stale scheduler with last-seen time and concise recovery guidance. Per-app overdue status must show the reason rather than only an old date.
- [ ] Reuse the authenticated manual update endpoint for `Check for updates now`; show its accepted operation immediately and poll the existing operation APIs. Label that changes will be deployed. Retain its unavailable-worker response.
- [ ] Preserve automatic/manual trigger labels through worker execution and history. Stop labeling a manual check as `Last auto update`.
- [ ] Test each state, stale snapshot error, queued-to-running-to-terminal progress, log opening, keyboard access and narrow mobile layout. Use existing theme tokens and 44px touch targets.

**Deliverable:** The reported experience of “it is not even trying” always has an inspectable state and action.

## Task 6: Migration, supervised startup and end-to-end proof

**Files:** `scripts/servermon-apps-worker.service`, `scripts/install.sh`, `scripts/check-release-contract.ts`, `DEPLOY.md`, `CLAUDE.md`; create `docs/apps-auto-update.md` and `src/lib/apps/auto-update.integration.test.ts`.

- [ ] Implement an idempotent additive migration: initialize generations/failure counters, normalize missing/null dates for enabled apps to due now, preserve history, and recover deployed SHA only from proven active-release metadata. Do not deploy anything from the migration itself.
- [ ] Verify indexes exist before enabling automatic enqueue. Test concurrency against a disposable real MongoDB instance, not mocks alone; do not require transactions unless the supported MongoDB deployment already provides them.
- [ ] Verify the installer/release contract starts and supervises the worker, passes the same database and Apps root configuration, and restarts it on failure. Publish explicit scheduler startup logs and runbook commands using the actual installed unit name.
- [ ] Roll out with the worker stopped/drained and the web process restarted without its old scheduler before starting the new worker. Do not allow old direct schedulers and new queued schedulers to run together. Drain before code rollback; keep additive fields and operation history intact.
- [ ] On a disposable Linux host and test repository: deploy A, enable Daily, observe the immediate unchanged check, push B, advance the test schedule, observe automatic deployment, fail C's build, verify retained B and visible retry, fix the build prerequisite without changing C, verify C is retried and deployed.
- [ ] Stop/restart the worker and web server separately, verify downtime warnings and one catch-up attempt; test queued disable and manual rollback pause. Do not run this destructive fixture against real managed apps.
- [ ] Run targeted tests during each task, then all required checks once final implementation is ready:

```sh
pnpm format:check
pnpm check
```

- [ ] Update the workspace index for added files and document Daily semantics, retry behavior, health states, rollback pause and troubleshooting. Report production evidence separately from test results.

## Release acceptance gate

- An enabled app gets its first durable operation within 90 seconds when worker/database are healthy and no conflicting operation exists.
- Every due app either has an operation or an explicit blocked/overdue explanation; delays under queue load are visible.
- Remote B is retried after a failed B deployment even when the repository has no newer commit.
- Concurrent schedulers and manual mutations cannot produce overlapping active operations for one app.
- Restart/crash boundaries do not lose scheduled work or repeat successful activation without reconciliation.
- Unrelated edits preserve schedule and history; disable/rollback pause survives late completion.
- Worker-offline appears within the existing 20-second heartbeat threshold plus the UI refresh interval; scheduler-stale appears within 150 seconds plus refresh. The UI refresh interval is at most 15 seconds while Apps is visible.
- Focused regression tests, real-Mongo concurrency checks, disposable-host lifecycle checks and mandatory repository checks pass before release.

## Self-review

The plan covers missing-attempt evidence (Tasks 1/3/6), settings and retry semantics (2), deployed-commit correctness and execution ownership (4), understandable UI (5), migration and lifecycle validation (6). No live failure cause has been asserted without evidence. The migration, rollout ordering, failed-candidate retry and late-completion races are explicit release gates.
