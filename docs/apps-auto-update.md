# Apps automatic updates

Automatic updates check the configured Git branch and deploy a new release when its commit differs from the successfully deployed commit. A fetched checkout is not evidence of a successful deployment.

## Schedule

- Enabling auto-update schedules an immediate first check. Daily means every 24 hours after a completed check, not midnight.
- Editing unrelated app settings preserves the next check and history.
- An interval change recalculates the deadline. Changing the source schedules a new check.
- A failed deployment retains the current release and remains eligible for retry even if upstream has no newer commit.
- Disabling prevents queued automatic work from starting. A deployment already executing is allowed to finish.
- Rolling back pauses automatic updates so the next check does not undo the rollback. Enable the setting again to resume.
- **Check for updates now** queues a manual check and deploys any changes. It bypasses the scheduled wait.

## Read the status

The Apps page refreshes idle status every 15 seconds and active operations more frequently. Each Git app shows the next check, actual last attempt, last successful check and deployment, and deployed/upstream commit identities.

| State                 | Meaning                                                              |
| --------------------- | -------------------------------------------------------------------- |
| Scheduled             | Waiting for the next check                                           |
| Queued                | An operation exists, but Git execution has not started               |
| Checking              | Worker is preparing/fetching the Git source                          |
| Deploying             | Worker is building, activating or verifying the release              |
| Up to date            | The last successful check matched the known deployed commit          |
| Retry scheduled       | A failed attempt will be retried; its error remains visible          |
| Overdue               | A due attempt has not started within the expected polling window     |
| Blocked               | The worker, scheduler, or another active operation prevents progress |
| Status unavailable    | Snapshot refresh failed; displayed timestamps are last known values  |
| Paused after rollback | Automatic work is disabled to preserve the rollback                  |

Worker heartbeat and scheduler progress are separate: a running process can still have a stalled scan. The global status shows both last-seen and last-successful-scan timestamps. No successful check is inferred from merely enabling the setting.

## Troubleshooting a check that never starts

On the installed Linux host, inspect the actual unit names if your installation uses a custom service name:

```sh
systemctl status servermon servermon-apps-worker --no-pager
journalctl -u servermon-apps-worker -n 100 --no-pager
```

Confirm the worker uses the same installation, database and `SERVERMON_APPS_ROOT` as the web service. Inspect configuration locally; do not paste secrets or the complete environment into logs or support reports.

Check the app's enabled state and due time, worker last seen, last successful scheduler scan, active operation, and latest error. An active deployment, rollback or deletion excludes another operation for the same app. A queued entry is not a Git check; its actual start is recorded separately.

After correcting a failed worker service, restart it and observe the next scan and one catch-up operation. Do not start a second unsupervised deployment process to work around the queue.

## Upgrade and recovery

Stop/drain the old Apps worker, restart the web service with the new release, then start the new worker. This ensures an old web scheduler cannot execute alongside the new worker scheduler. The installer already stops both services before switching releases and supervises the worker with process-group termination and restart policies.

The schema changes are additive. Legacy app commit identity is recovered only from successful release evidence; otherwise the UI reports an unknown deployed version and the next enabled update reconciles it. Missing schedule dates become due without deploying during migration.

Before reverting application code, drain the worker and stop both schedulers. Keep operation history and additive metadata for diagnosis. If recovery cannot prove an old executor stopped, resolve the recovery-required state before allowing another host mutation.

### Recovery-required operation

A lost lease is not proof that a detached build or activation command stopped. An interrupted operation can therefore be marked failed while retaining its exclusive app lock. Its error is `RECOVERY_REQUIRED`; ordinary scheduled checks remain blocked instead of overlapping the old process.

Stop the previous worker's supervised service and verify that its entire process group has exited. If it ran on another host, verify that host too. Inspect the app's current release symlink, manifest and service health before permitting another deployment. A new worker can safely release an interrupted lock automatically when the prior worker recorded a graceful, fully drained stop.

For an unclean crash, an administrator must release only the inspected operation's lock in MongoDB after the checks above. Obtain the exact operation ID from Apps/logs. In `mongosh`, using the ServerMon database:

```javascript
db.appoperations.findOne(
  {
    operationId: 'REPLACE_WITH_EXACT_OPERATION_ID',
    active: true,
    'error.code': 'RECOVERY_REQUIRED',
  },
  { operationId: 1, appId: 1, lease: 1, error: 1 }
);
```

After verifying that record refers to the stopped executor and inspected app, release that one lock, retaining the failure and its history:

```javascript
db.appoperations.updateOne(
  {
    operationId: 'REPLACE_WITH_EXACT_OPERATION_ID',
    active: true,
    'error.code': 'RECOVERY_REQUIRED',
  },
  { $set: { active: false } }
);
```

Confirm exactly one record matched, then restart the worker. The next check reconciles the active release before deciding whether another deployment is needed. Do not bulk-unlock operations or clear leases while an executor may still be running.

## Release verification

Use a disposable app and repository on Linux. Verify an immediate first check, unchanged result, automatic deployment after a new commit, a failed build retaining the previous release, retry of the same commit after correcting the build prerequisite, worker/web restart catch-up, disable-before-execution, and rollback pause. Concurrency tests need a disposable MongoDB database. Never use production managed apps for these fixtures.
