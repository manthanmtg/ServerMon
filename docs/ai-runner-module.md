# AI Runner Module

AI Runner turns saved prompts, one-off runs, schedules, and multi-step AutoFlows into one queue backed by durable run history.

## Workspaces

Workspaces are named folder paths, such as `ServerMon Repo` -> `/root/repos/ServerMon`.

Each workspace has:

- `Workspace Name` for selectors and history.
- `Workspace Path` for the actual working directory.
- `Blocking workspace` to allow only one active AI Runner job in that workspace at a time.
- `Enabled` to hide retired workspaces from new run forms without deleting history.

Workspaces live in the AI Runner `Settings` tab. Run, Schedule, and AutoFlow editors all use the same workspace list. Editors still allow a custom path, and the path input uses known directories for autocomplete. If a custom path should become reusable, use `Save workspace` from the editor.

When a workspace is blocking:

- A manual run is rejected if a queued or active job already exists in that workspace.
- Schedules and AutoFlows can queue work, but the supervisor only dispatches one job for that workspace at a time.
- Jobs in other workspaces continue dispatching normally.

## Prompt Templates

Prompt Templates are reusable wrappers for prompt editors. They are different from Saved Prompts:

- Saved Prompts are complete prompt bodies that can be run or scheduled directly.
- Prompt Templates are inserted into an editor while drafting a run, saved prompt, or AutoFlow step.

Use `<YOUR_PROMPT>` inside a template to mark where the current editor content should be inserted. If the marker is absent, AI Runner appends the current editor content after the template.

Example:

```text
Checkout main, reset code,

<YOUR_PROMPT>

Create PR using gh cli
```

Templates are managed from `Settings` and can be loaded from inline prompt editors across the module.

## Import And Export

The `Settings` tab includes `Export AI Runner` and `Import AI Runner` actions for moving production configuration between ServerMon installs.

Exports are JSON bundles with stable references instead of MongoDB IDs:

- Profiles are referenced by `slug`.
- Workspaces are referenced by `path`.
- Prompts and prompt templates are referenced by `name`.
- Schedules store their prompt/profile/workspace references by those portable keys.

Export can include any combination of:

- Settings.
- Agent Profiles.
- Workspaces.
- Saved Prompts.
- Prompt Templates.
- Schedules.

Run history, logs, jobs, and AutoFlow executions are intentionally excluded because they are runtime state, not reusable configuration.

The export modal can generate JSON, copy it to the clipboard, or download it as a `.json` file.

The import modal supports both pasted JSON and uploaded JSON files. Before applying an import, ServerMon previews:

- Incoming item counts by resource type.
- Conflicts with existing records.
- Missing schedule references.

Each conflict can be skipped or overwritten independently. Imports are blocked when a selected schedule references a prompt, profile, or workspace that is neither already present nor included in the same import selection.

## Runs

The `Run` tab is for immediate work. Choose:

- Inline Prompt, File Reference, or Saved Prompt.
- Agent Profile.
- Workspace or custom path.
- Timeout.

If the selected workspace is blocking and already has active AI Runner work, the run is not queued.

## Schedules

Schedules bind a saved prompt, agent profile, workspace, timeout, retry count, and cron cadence.

The scheduler keeps schedule queueing globally controllable. Turning off `Global Auto-Queue` pauses automatic queue creation without deleting or disabling individual schedules.

Manual `Run Now` on a schedule reuses the schedule's workspace and prompt. Blocking workspace rules still apply at dispatch time.

## AutoFlow

AutoFlow is a multi-step prompt queue for related work. It is similar to schedules because it creates durable runs, but it is user-started and step-based rather than cron-based.

AutoFlow supports:

- `Sequential` mode: queue one step, wait for it to finish, then queue the next step.
- `Parallel` mode: queue all pending steps, while still respecting blocking workspaces.
- `Continue after failed step`: continue remaining pending steps after a failure.

The default AutoFlow mode is configured in `Settings`; each AutoFlow can override it in the builder.

Each AutoFlow step has its own prompt, profile, workspace, custom path fallback, and timeout. Step runs appear in normal run history with `autoflow` as the trigger.

## Queue Behavior

The queue stores runs and jobs separately:

- A run is the user-facing history record.
- A job is the dispatchable unit consumed by the supervisor and worker.

The supervisor loop:

1. Reconciles stale jobs.
2. Queues due schedules.
3. Advances running AutoFlows.
4. Dispatches runnable jobs while enforcing global concurrency and blocking workspaces.

This keeps the module consistent: manual runs, schedules, and AutoFlows all flow through the same durable queue and history surface.
