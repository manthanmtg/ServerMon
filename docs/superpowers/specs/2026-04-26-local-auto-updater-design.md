# Local Auto-Updater Design

## Goal

Add a local auto-updater for the ServerMon host. ServerMon owns the schedule, policy, UI, and history, while the actual update work runs as a detached `systemd-run` job so it can continue if ServerMon restarts during its own update.

The feature applies only to the local ServerMon host. It does not create fleet-wide rollout jobs. If a colocated `servermon-agent.service` is installed and running, the updater can include that single local agent after the ServerMon app update succeeds.

## User-Facing Behavior

- The Settings `ServerMon Services` card gains a scheduler-first auto-update section.
- The user can enable or disable local auto-update.
- The user selects one daily maintenance time and a timezone.
- The card shows next run, last result, and the fixed missed-run policy: 2 hours, 1 retry.
- Manual `Update ServerMon`, `Update Agent`, and `History & Logs` actions remain available.
- The updater checks for upstream changes before launching update work.
- If neither ServerMon nor the local agent has upstream changes, the run is recorded as skipped.

## Schedule Policy

Version 1 supports one daily schedule:

- `enabled`: boolean.
- `time`: local wall-clock `HH:mm`.
- `timezone`: IANA timezone such as `Asia/Kolkata`.
- Missed-run grace: 2 hours after the scheduled time.
- Missed-run retry: 1 catch-up attempt per scheduled day.

The scheduler runs inside ServerMon and wakes periodically. On startup, it also evaluates whether today’s scheduled time was missed. If the missed time is still within the 2-hour grace window and today has not already launched or consumed its catch-up attempt, ServerMon launches the detached updater job.

If ServerMon is down outside the grace window, the updater waits until the next scheduled day.

## Update Sequence

When a scheduled run is due:

1. ServerMon checks whether a local update run is already active.
2. ServerMon checks whether the ServerMon repo has upstream changes.
3. ServerMon inspects the colocated agent status.
4. If the agent is installed and running, ServerMon checks whether the agent repo has upstream changes.
5. If no updates are needed, ServerMon records a skipped run and exits.
6. If updates are needed, ServerMon launches one detached `systemd-run` job.
7. The detached job updates ServerMon first.
8. If ServerMon update succeeds, the detached job updates the agent when the agent update was needed.
9. If ServerMon update fails, the detached job stops immediately and does not attempt the agent update.

The local agent is updated only when `servermon-agent.service` is installed, active, and its repository has upstream changes. If the agent is missing, stopped, or unsupported, the run records that as a skipped agent phase.

## Detached Runner

ServerMon should not coordinate the update steps after launch. It should build a durable command or script and start it with `systemd-run` so the job survives a ServerMon restart.

The detached runner writes status and logs to the existing update history area used by manual updates. It should record phase-level outcomes:

- ServerMon check.
- ServerMon update.
- Agent check.
- Agent update.

This keeps the history useful for mixed outcomes, such as “ServerMon updated, agent failed.”

## Upstream Change Detection

The scheduler should check before updating. The detection should avoid changing the working tree.

Expected behavior:

- Fetch remote metadata.
- Compare the current branch or configured upstream against the local HEAD.
- Return `changed`, `unchanged`, or `failed`.
- Treat check failure as a failed run, not as permission to update blindly.

The implementation should reuse existing repo locations:

- ServerMon repo: `SERVERMON_REPO_DIR` or `/opt/servermon/repo`.
- Agent repo: detected from `servermon-agent.service` `WorkingDirectory`, falling back to `SERVERMON_AGENT_REPO_DIR` or `/opt/servermon-agent/source`.

## Settings Storage

Store local auto-update settings in an app-managed local configuration file at `/etc/servermon/auto-update.json`, not in fleet update jobs.

The settings need enough metadata to prevent duplicate launches:

- enabled flag.
- daily time.
- timezone.
- last scheduled date launched.
- last skipped date, when no upstream changes existed.
- last catch-up date attempted.
- current active run id, if any.

The settings API must require authentication.

## UI Direction

Use the scheduler-first direction from the mockup.

The `ServerMon Services` card should be structured as:

1. Header with icon, title, and concise description.
2. `Scheduled updater` section with enable toggle, daily time, timezone, next run, and retry summary.
3. Compact sequence strip: check app, update app, check agent, update agent.
4. Manual actions: update ServerMon now and history/logs.
5. Local agent status and manual agent actions.

Schedule editing opens a compact modal. It should expose only the v1 controls:

- enabled toggle.
- daily time.
- timezone.

Fixed behavior should be visible but not over-configurable:

- check before updating.
- include running local agent.
- stop agent update if ServerMon update fails.
- missed run retry is 2 hours, 1 retry.

## Failure Behavior

- If upstream check fails, record failure and do not update.
- If ServerMon update fails, stop immediately and do not attempt the agent update.
- If ServerMon succeeds but agent update fails, record a mixed result with app success and agent failure.
- If the local agent is not installed, not running, or has no update support, skip the agent phase with a clear reason.
- If a scheduled run is already active, do not launch another run.
- If ServerMon misses the scheduled time, allow one catch-up launch within 2 hours.

## Testing Plan

Add focused tests for:

- timezone-aware due-time calculation.
- already-launched-today prevention.
- missed-run grace window and one retry.
- upstream change detection for changed, unchanged, and failed checks.
- detached launcher command construction.
- stop-on-ServerMon-failure behavior.
- skipped run history when no upstream changes exist.
- mixed app success and agent failure history.
- UI rendering for enabled/disabled schedules, next run, timezone, agent present, agent missing, and duplicate launch disabled state.

## Out of Scope

- Fleet-wide automatic agent rollout jobs.
- Flexible cron expressions.
- Multiple maintenance windows.
- Rollback automation.
- Non-systemd detached launch fallback.
