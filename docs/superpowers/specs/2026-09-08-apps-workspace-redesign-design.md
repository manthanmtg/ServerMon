# Apps Workspace Redesign — Implementation Design

## Goal

Make the Apps entry screen a polished operations console: scan several apps at once, understand what needs attention, open a focused app workspace, and follow deployments through truthful execution stages.

This is a UI feature and focused refactor, with a bounded backend observability extension for deployment stages. Affected surfaces are Apps UI, operation progress reporting, existing API consumers, tests, and documentation. This document is the implementation handoff; no application code was changed while preparing it.

## Current State

Inspected on 2026-09-08. Repository conventions are in `CLAUDE.md`. The stack is Next.js 16.1.6, React 19.2.3, TypeScript, MongoDB/Mongoose, Tailwind CSS 4.2, Vitest, and Playwright. Use pnpm exclusively.

| Owner                                                 | Current behavior and implications                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/apps/ui/AppsPage.tsx`                    | Roughly 2,200 lines combine form state, requests, polling, app cards, runtime detail, environment variables, release history, and operation log selection. Each card exposes seven actions and a large automatic-update panel. Extract presentation without replacing the operation architecture.              |
| `src/modules/apps/ui/AppsSummaryCards.tsx`            | Already shows total, running, failed, and active-operation counts. Restyle this existing summary; do not add another redundant summary section.                                                                                                                                                                |
| `src/modules/apps/ui/components/AutoUpdateStatus.tsx` | Implements substantial state precedence: stale snapshot, rollback pause, disabled, worker unavailable, queued/cancelling/running, scheduler unavailable, active-operation block, retry, overdue, failure, and last checked commit comparison. Preserve these distinctions in compact presentation.             |
| `src/modules/apps/ui/automationHealth.ts`             | Validates worker/scheduler health and server time. Missing health is not evidence that automation is healthy.                                                                                                                                                                                                  |
| `src/modules/apps/ui/appPayload.ts`                   | Normalizes app payloads and legacy operation rows. Keep its compatibility behavior and validate new durable/event payloads separately.                                                                                                                                                                         |
| `src/modules/apps/types.ts`                           | Already defines runtime CPU, memory, uptime, restart counts, durable operation status/phase, and sequenced events. Historical metric series are absent.                                                                                                                                                        |
| `src/modules/apps/ui/AppsPage.tsx` polling effect     | Refreshes the list every 15 seconds when idle, every 1.5 seconds during active work, and separately checks locally accepted durable IDs. Keeps locks through refresh failures. Do not introduce per-card polling.                                                                                              |
| Existing operation endpoints                          | Mutation responses use HTTP 202 compatibility envelopes. Detail returns `{ data: { operation } }`; events return `{ data: { events } }` with an `after` sequence cursor and maximum page size 100.                                                                                                             |
| `src/lib/apps/service.ts`                             | List DTOs combine execution history with active durable rows. Queue IDs start with `op_`; execution rows have human-readable steps/logs. Updates link execution rows via `queueOperationId`; manual deploy and rollback do not consistently propagate that link yet.                                           |
| `src/lib/apps/worker/runner.ts`, `legacy-executor.ts` | Durable worker ownership is fenced by worker ID and lease generation. The runner supplies an abort signal and ownership assertion to execution. Preserve deadlines, recovery, and lease semantics.                                                                                                             |
| `src/lib/apps/deploy.ts`                              | Emits text through `onProgress`. Install/build command output is buffered until each command finishes. It does not emit a complete structured stage sequence. `service.ts` sets the update durable phase to `build` before the entire deployment routine, so the enum alone cannot power an accurate timeline. |
| History/runtime dialogs                               | History uses a bespoke overlay and a captured app object. Runtime logs use shared `Dialog`. Both are used only by AppsPage. Replace their standalone destinations with workspace tabs.                                                                                                                         |
| Shared UI                                             | `Drawer`, `Dialog`, `ConfirmationModal`, `OperationLogViewer`, and `OperationLogDialog` exist. Shared overlays trap focus, isolate the background, restore focus, and handle stacked Escape behavior. Reuse them.                                                                                              |
| Theme                                                 | `globals.css` and theme providers already supply primary, success, warning, destructive, surface, border, and font tokens for multiple themes. No new global palette or font is needed.                                                                                                                        |

Existing tests cover queued updates/deployments, worker 503 responses, stale snapshots, recovery, operation correlation, follow/autoscroll behavior, environment masking, editing, deletion confirmation, and rollback. These are behavioral contracts, even where their current selectors refer to the old layout.

An unrelated untracked file, `src/modules/network/ui/components/SpeedtestHistoryModal.test.tsx`, existed when planning began. Preserve it and all other unrelated work.

## Requirements

1. Default to a compact two-column card collection where available content width permits it, with a compact list option, search, and status filters.
2. Keep identity, public domain, app status, source/branch, deployed version, deployment age, and a compact automation summary visible without opening details.
3. Provide one app workspace with Overview, Deployments, Logs, and Settings tabs. Selection must resolve from the newest app snapshot by ID.
4. Keep Open app and Deploy visible. Put secondary actions in a labelled action disclosure; put deletion in Settings with the existing explicit irreversible-deletion confirmation.
5. Rename the manual Git update action to **Check & deploy** everywhere in this module and its documentation. Preserve its existing backend behavior.
6. Show runtime state, deployment-operation state, automation state, and freshness as distinct facts. A stale snapshot cannot retain an unqualified green Running or Up to date presentation.
7. Render a deployment stage timeline using structured execution evidence, including failure, skipped stages, queued time, and terminal outcomes. Never infer a successful stage from elapsed time or raw command text.
8. Preserve existing creation/editing payloads, environment masking, releases, rollback behavior, logs, request timeouts, and per-app action locks.
9. Extend local accepted-operation tracking to rollback and deletion, which also return HTTP 202. Acceptance must never be presented as completion.
10. Support keyboard use, 44px minimum interactive targets, reduced motion, light/dark themes, long content, and narrow screens without page-level horizontal scrolling.
11. Keep one Apps list poller, bound selected-operation event fetching, and avoid new dependencies, schema migrations, or new mutation endpoints.

## Assumptions

- The request approves planning the previous visual direction, not implementing, committing, or deploying it. Only this design document is produced now.
- The desired style is a restrained operations console using the existing violet/primary accent and active ServerMon theme. No forced dark theme or global restyle.
- First-release scope includes compact cards/list, search/filter, the workspace, truthful freshness, and stage progress. Fleet activity feeds, metric history, custom app artwork, and graphs are deferred.
- Existing runtime snapshot values can be surfaced on cards. No uptime percentage, trend, latency, certificate-health claim, or synthetic metric is introduced.
- App selection and tab state are local to the Apps page for this release. Closing the workspace restores the collection's scroll, search, and filter state. Shareable detail URLs are deferred.
- Persist only the grid/list preference, under `servermon.apps.view.v1`; unavailable browser storage falls back to grid. Do not persist fetched app payloads, logs, form values, or environment variables.
- Structured stage emission is included because the proposed live timeline requires data the current worker does not reliably emit. It extends observability while preserving deployment order and host actions.
- Existing synchronous compatibility responses remain supported. Old workers/history receive a coarse, explicitly limited progress view.

## Proposed Design

### 1. Entry screen and visual hierarchy

Keep `ProShell` as the page shell. Change its outdated local-only subtitle to “Deploy and manage application releases.” Inside the page use the compact summary, toolbar, and app collection in that order; place a single freshness/automation notice between summary and toolbar when attention is needed. Preserve a small healthy automation indicator without a large success banner.

```text
Apps                                           [+ New App]
Managed apps · Running · Failed · Active operations
[Shared refresh/automation warning, only when applicable]
[Search apps…] [All / Running / Needs attention / Busy] [Grid | List]

┌ SolarStats                       Running ┐  ┌ LifeOS ...
│ solarstats.example.com ↗                 │
│ Git · main · deployed 8d84187            │
│ Deployed 13 days ago · CPU 1.2% · 84 MB   │
│ Auto-update · Up to date · checked 5m ago│
│ [Open app]                   [Deploy] [⋯]│
└─────────────────────────────────────────┘
```

Wireframe values are illustrative, not data to seed or hardcode.

- Use a module-local container query: one column below 960px collection width, two columns at or above it. Respect shell/sidebar width rather than using viewport width alone. Do not add a third card column in this release.
- Card target: approximately 250–300px high with ordinary names and no warnings; use natural height, not clipping or a fixed height. A 1440×1000 desktop viewport with standard shell should show four ordinary cards without scrolling through diagnostics.
- Card padding 20px, gaps 16px, radius 12–16px using existing tokens/utilities. Name 16–18px semibold; body 14px; supplementary text at least 12px. Numeric values use tabular figures, SHAs/ports use monospace.
- Use a deterministic two-character monogram derived from the app name, falling back to the slug. Use `bg-primary/10 text-primary` for identity; semantic status colors remain reserved for state. No remote favicon fetching or screenshots.
- Make the app name an explicit button labelled `Open {name} workspace`; do not wrap the card's links/buttons inside another button. The public-domain link is separately operable.
- Card primary action is Deploy, secondary action Open app, and a 44px action trigger labelled `Actions for {name}`. Disclosure entries: Check & deploy (Git only), Deployment history, Runtime logs, Settings. Render a small disclosure containing ordinary buttons with normal Tab order, `aria-expanded` and `aria-controls`; do not claim ARIA menu semantics without implementing menu keyboard behavior. Escape/outside click closes it and returns focus when appropriate. Only one disclosure is open.
- No Delete action on the entry card. Active cards show a labelled compact progress row with current observed stage and a View progress action. It opens Deployments in that app workspace.
- Hover/focus can strengthen the border and shadow; use 150–200ms color/opacity transitions. Animate only active work and workspace entry, not every poll. Respect `prefers-reduced-motion`.
- List mode uses the same card data/actions in a horizontal responsive layout: identity, state, version/age, automation, actions. Below 768px it stacks. Keep all actions keyboard-accessible and omit no warning information to save width.

Search is case-insensitive over name, domain, slug, Git URL/branch, and local source path. It never searches environment values, logs, or commands. Apply filters to the cached list without requests. Sort by name then ID for stable ordering; do not reorder cards on each status update. Keep fleet summary counts independent of filters and show “N of M apps” for results.

Filter definitions:

| Filter          | Membership                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All             | All normalized apps.                                                                                                                                                                      |
| Running         | `status === 'running'`; stale results are labelled last known.                                                                                                                            |
| Busy            | Pending local mutation, accepted operation lock, active durable state, execution running, or app status deploying.                                                                        |
| Needs attention | Stale snapshot, app failed/unknown, runtime explicitly unavailable, or automatic-update presentation marked warning. Draft and intentionally stopped apps are not failures by themselves. |

Distinguish loading skeletons, initial fetch failure with Retry, no configured apps with New App, and no search results with Clear filters. A failed subsequent refresh retains cards.

### 2. Freshness and automation presentation

Extract the current automatic-update decision tree into pure `deriveAutoUpdatePresentation({ git, health, snapshotUnavailable, now })` in `autoUpdatePresentation.ts`. Return `{ label, detail, tone, warning, latestOutcome, latestError, nextCheckAt, lastOperationId }`. Preserve the existing precedence and 90-second overdue tolerance; both the compact summary and detailed component consume this result.

- `AutoUpdateSummary` shows automation label, interval when enabled, and last successful check age. Warning conditions always retain their explicit label. A failed latest outcome remains visible even when the current label is Retry scheduled or Overdue.
- Clicking the summary opens Overview and expands/focuses the detailed Automatic updates disclosure. It does not start a check.
- Retain all seven diagnostic fields and latest-log linkage in `AutoUpdateStatus`, used within that disclosure. Remove the old action-label explanation and replace it with “Check & deploy fetches the branch and deploys available changes.”
- Local-source apps show “Local source · Manual deployments”; do not render Git scheduling controls.
- Stale list: one page-level warning says “Could not refresh Apps. Showing the last successful snapshot from …” with Retry. Each affected card shows `Last known: {status}` in a neutral/warning treatment and `Updates: status unavailable`. Freeze active-stage animation; label retained progress “Last observed.” Summary counts receive a last-known qualifier too.
- Healthy list with missing automation health: show automation health unavailable, retaining factual timestamps. Do not claim current scheduler health or hide a known block reason.
- Worker and scheduler failures share one infrastructure notice, with a compact Blocked indicator on affected apps. Per-app build errors remain app-specific.
- Add `formatRelativeTime(value, now)` for now/minutes/hours/days/months/years, preserving future times. Invalid/missing values return the caller's explicit fallback. Render `<time dateTime>` with a full localized date in the expanded detail or an accessible labelled disclosure; a mouse-only tooltip is insufficient.
- Keep the last successful server time and client receive time separately. When healthy, calculate a display clock from server time plus elapsed client time. Without server time use the client clock. On failure freeze last-observed operation duration while allowing snapshot age to advance. Use one page clock, at most once per second during active progress and once per minute otherwise; no per-card intervals or live-region announcements for clock ticks.

Runtime display uses `app.status` as managed status and `runtime` as a separately labelled observation. Show CPU and memory only when runtime is available and the values are finite; missing values display an em dash, not zero. Zero is valid. Do not clamp CPU to 100%, because a process may use multiple cores. Expose runtime `checkedAt` in Overview.

Public links use the configured scheme (`tlsEnabled ? 'https' : 'http'`), with `target="_blank" rel="noopener noreferrer"`. Describe TLS as configured/requested, not certificate validity. Do not turn arbitrary repository strings or local paths into unvalidated links.

### 3. App workspace and preserved actions

Add `AppWorkspace` built on shared `Drawer`, approximately `min(92vw, 64rem)` wide on desktop and full width on mobile. Override width using the existing className prop; do not change shared Drawer defaults. The local `cn()` only joins classes, so use a higher-specificity override such as `[&]:w-screen md:[&]:w-[min(92vw,64rem)]` rather than relying on the order of conflicting width utilities. Resolve `selectedAppId` against current `apps` on every render. Tabs mount only their active panel, use `tablist`/`tab`/`tabpanel`, labelled relationships, roving focus, Arrow keys, Home/End, and automatic activation for these local lightweight panels.

| Tab         | Content and behavior                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview    | Identity/domain, current release and deployed SHA, runtime snapshot (service/PID, CPU, memory, uptime, restarts, checked time), source details, current operation preview, and the expandable Automatic updates detail.                                                                              |
| Deployments | Selected operation stage timeline plus `OperationLogViewer`, recent logical operations, and release history. Operation list includes updates and their unchanged outcomes; releases remain a separate list. Select a historical item to inspect it without replacing the active-operation indicator. |
| Logs        | Runtime/journal entries using extracted existing rendering, first 200 lines, explicit Refresh, request loading/error/empty states. Fetch only when this tab is opened or refreshed; do not add automatic streaming.                                                                                  |
| Settings    | Read-only source, commands, domain/port, TLS/DNS, health path, and masked environment variables; Edit configuration opens the existing form in shared Dialog. Place Delete app in a separated danger section with the existing full confirmation wording.                                            |

`AppConfigurationDialog` owns the extracted form state/helpers and JSX. Props: `{ open, app?: ManagedAppDTO, busy, onClose, onSave(input: CreateManagedAppInput): Promise<void> }`; absent app means create. Seed a draft on opening or changing edited ID, never on each poll. Preserve all template/source/interval/commands/env inputs and existing validation/payload omission semantics. Close only after successful save; display errors inside the form and retain values on failure. Use shared Dialog with the existing labelled close action. Disable dismissal while submitting. A dirty close asks Discard changes/Keep editing using shared confirmation; no silent loss. `onSave` rejects on a failed mutation and resolves after an accepted save even if the following list refresh fails. The dialog catches rejection for inline feedback; AppsPage owns refresh warnings.

The workspace remains mounted beneath form/log/confirmation overlays so nested close restores focus to its opener. Use shared overlays and do not retain the old bespoke z-index-90 form/history overlays. When an app disappears after a successful list refresh, close its workspace and restore focus to the collection heading or New App button if the original trigger no longer exists. A refresh failure alone must not close it.

Environment reveal state resets when the Settings tab closes, the app changes, or the workspace closes. Only a user reveal action renders the value. Clipboard failures show inline feedback. No sensitive value enters URLs, preferences, progress summaries, or diagnostics added by this change.

### 4. Operation identity, requests, and polling

Keep AppsPage as the request/state coordinator. Extract pure helpers to `appPresentation.ts` and `appOperationPresentation.ts`; do not introduce a new global store or another networking framework. Remove expanded-card/all-operation-card state after all detail content moves into the workspace. Preserve the existing follow, autoscroll, wrap, and frozen-log-snapshot state independently per logical operation.

Define UI-only types in `appOperationPresentation.ts`:

- `OperationTarget`: app ID, operation type, optional durable ID, optional execution ID, optional captured historical operation/release fallback, and execution IDs present before request submission.
- `OperationObservation`: validated `AcceptedAppOperation`, receive time, freshness/error state, and sequenced progress events.
- `StagePresentation`: phase, label, state (`pending | active | completed | skipped | failed | unknown`), optional observed start/end times.
- `deriveOperationPresentation(target, execution, observation, now)` returns canonical status, stages, elapsed/queued duration, error, and observation freshness without mutating its inputs.

Map durable `cancel_requested` to the shared viewer's `cancel-requested`, and `cancelled` to `canceled`. Add one additive shared `OperationStatus` value, `unknown`, with a neutral “Status unavailable” label and `live: false`; use it for missing history or unavailable current observation while retaining separately labelled last-known facts. This avoids manufacturing a failed/running status to satisfy the viewer type. Keep all existing shared status values and presentations unchanged.

Correlation order: exact `queueOperationId` to durable ID; explicit execution ID; captured historical operation; existing legacy “new execution of the same type after submission” fallback. Do not select an arbitrary old execution because it shares a type. Prefer actual execution logs over synthetic “Operation claiming in Apps worker” rows. Durable terminal/cancellation state takes precedence over a stale compatibility execution status; log output still comes from the correlated execution. Preserve queue/execution deduplication in summary counts, improving it with explicit linkage where present and retaining the old fallback for older records.

For deploy/update/rollback/delete, use the existing endpoints and the same timeout values (60s/10min/60s/10s respectively). Share an app-ID pending-request guard across mutation types so rapid Deploy then Check & deploy cannot create two local submissions. HTTP 202 establishes a durable lock and an informational Queued notice. Resolve payload keys `deployment`, `update`, `rollback`, and `deletion` respectively. Create/edit retain 15s timeout and existing payloads. Server-side admission remains authoritative.

- Keep locks when a list/detail refresh fails. Closing the workspace or log dialog does not release them.
- Rollback eligibility is only a superseded release with an ID, and no app mutation already active. Explain that successful rollback pauses auto-update; keep the backend pause behavior unchanged.
- A queued deletion stays represented until the server removes the app. Store its last name/ID independently so progress and terminal feedback survive removal from the list. Do not immediately display “Deleted” on 202.
- Disable configuration submission and destructive/deployment actions while that app is busy; log viewing and Open app remain available. Known unavailable worker disables enqueue actions with a reason; unknown health permits the request and handles server 503. A stale snapshot requires successful Refresh before starting a new mutation. Server 409/503 must show actionable error feedback and clear only the unaccepted request state.
- Preserve synchronous compatibility responses; they produce the existing outcome notices and refresh once. Never manufacture a durable ID.

Extend the existing single polling effect rather than adding a card or drawer timer:

1. Poll list at the current idle/active cadences. Deduplicate in-flight list loads including manual Retry, and ignore responses from older request generations or an unmounted page.
2. Watch the union of accepted durable IDs, active queue rows discovered from the list, and the selected durable operation. Deduplicate IDs. Poll detail once per watched ID per cycle; cap concurrency at four using a small local batch loop, not a new dependency.
3. Fetch events only for the selected operation with a durable ID and only when its Deployments panel or full-screen logs are visible. Start at `after=0&limit=100`; append unique events by sequence, validate IDs, and advance the cursor to the highest accepted sequence.
4. Fetch at most two event pages per cycle. Continue on a later cycle if full; retain a maximum of 500 raw events plus a compact per-phase evidence map. Do not let a truncated event window erase known stage evidence. Phase events use the backend shape specified below; ignore unrelated event details.
5. After terminal detail, drain selected remaining event pages under the same limits until a short page arrives, then stop detail/event polling for that selection. Idle list refresh continues. Legacy operations without a durable ID need no events request.
6. A 404/410 detail response means “Operation history unavailable or expired,” never proof of deployment failure or success. Stop querying that ID. Release its local lock only after a successful list refresh shows no active operation for the app; otherwise retain busy state. Keep this distinct from the existing legacy failed-shaped fallback object used solely by the old log viewer.
7. Guard each result by request generation and selected operation ID. Switching apps or operations must not display the previous request's events/logs. Abort requests on unmount where supported and always ignore late results. Restore full freshness on the next successful matching response.

Runtime logs use a separate on-demand request keyed to selected app ID, with the same race protection. Runtime errors must not mark the entire app list stale.

### 5. Truthful deployment stage reporting

Use existing `AppV2OperationPhase` values and `AppOperationEventDTO`. Add a typed `AppStageUpdate` in `src/modules/apps/types.ts` with `phase` excluding queued/claiming/terminal, `state: 'started' | 'completed' | 'failed' | 'skipped'`, and a fixed non-sensitive message. Persist it as a `progress` event with `phase` and `details: { stageState }`. No schema change: the phase enum and event details already exist.

Add optional `reportStage(update): Promise<void>` to `AppExecutionContext`, `UpdateManagedGitAppOptions`, rollback options, and `DeployNextJsAppOptions`. Production runner supplies it; direct legacy callers may omit it. Add a dependency-injectable repository helper `recordAppOperationStage({ operationId, workerId, leaseGeneration, update, now })`:

- Conditionally update phase for stage start using operation ID, active true, running/cancel_requested status, matching worker/generation, and an unexpired lease. It must never set status, extend a lease, clear active ownership, or move a terminal record back to running.
- Validate ownership for completion/failure/skipped reports as well; those events must not overwrite the current phase (especially during cleanup after a failed stage).
- Return an explicit ownership-mismatch outcome when the fence matches no record. The runner handles it through its existing lease-lost abort path.
- Append a redacted advisory progress event through `appendAppOperationEvent` after the fenced check. Log event-write failures with operation ID/phase, and continue execution. Event append and phase write are not transactional today: the UI treats durable terminal status as authoritative and ignores late advisory events that would reactivate a terminal operation.
- A transient phase/event persistence exception is an observability warning, not a fabricated stage success or a new automatic retry. Keep existing ownership assertions before host mutations; never catch/swallow an abort or definite ownership mismatch in the reporter. The reporter must not change the release engine's behavior when telemetry alone is unavailable.

`legacy-executor.ts` passes `durableOperationId: operation.id` for manual deploy, update, and rollback, and passes the reporter to the service. Populate `queueOperationId` when creating deploy and rollback execution rows; the schema already supports it. Keep trigger metadata. Remove the coarse direct update-to-build database write in `updateManagedGitApp`; the structured reporter now supplies the phase at the real boundary.

Stage order must follow actual execution, including activation preceding health checks:

| Display group | Existing phase | Emit around actual work                                                                                                                                      |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prepare       | preflight      | Legacy executor app existence, schedule/config compatibility checks. An early cancellation remains Cancelled, not a failed build.                            |
| Source        | source         | `prepareSource` for manual deploy and Git update. For local sources use “Prepare local source,” never “Fetch.”                                               |
| Build         | stage          | Release directory/source copy and env/deploy metadata preparation before install. Display “Prepare release”; enum ordering does not dictate execution order. |
| Build         | install        | Immediately before/after configured install command.                                                                                                         |
| Build         | build          | Immediately before/after configured build command.                                                                                                           |
| Activate      | activate       | Existing systemd setup/current-release symlink and service restart.                                                                                          |
| Verify        | health         | Existing health check attempt loop. Intermediate retries remain the same active stage.                                                                       |
| Publish       | routing        | Nginx configuration, validation, and reload.                                                                                                                 |
| Publish       | tls            | Existing certbot/certificate reuse path. Disabled TLS is explicitly skipped; certificate reuse is completed with that explanation.                           |
| Finish        | finalize       | Success metadata and service-layer app/release/outcome persistence. Avoid emitting a final success before these writes finish.                               |
| Recovery      | cleanup        | Existing failure recovery, only when it actually runs. Preserve the original failed stage separately.                                                        |

The runner's existing queue/claim/terminal status events describe lifecycle boundaries. Report start/completion for each executed stage and failure before entering recovery, without changing the existing catch/recovery behavior or replacing the original error. Service-level source/preflight failures must have evidence even when the deployment routine never starts.

An unchanged Git check completes Source and ends Unchanged; Build/Activate/Verify/Publish are explicitly not needed in UI, never green completed. Rollback uses Prepare → Activate → Verify → Finish; delete uses Prepare → Remove (`cleanup`) → terminal. Do not display a build sequence for these operation types. Wrap existing delete execution for coarse Remove reporting; do not redesign its host-mutation implementation.

Timeline rules:

- Group phases as above in an ordered list, with optional expanded substeps. Completion requires an explicit completed event. A later observed phase may prove work advanced, but earlier unobserved stages remain “Not recorded,” not checked green.
- Use queued `createdAt` and actual `startedAt` separately. Running elapsed time ends at `completedAt`; per-stage durations require observed start/end pairs. Do not invent percentages or estimates.
- Terminal failed status wins over every nonterminal event. Highlight the explicit failed stage if recorded, otherwise show “Operation failed; failing stage not recorded.” Cleanup never erases the failure.
- Terminal succeeded means “Deployment completed” or “Rollback completed.” Only show “Current release” when the fresh app snapshot confirms the associated release; a historical success is not proof the app is currently live.
- Old history/no stage events uses the existing human-readable step plus lifecycle/status and “Detailed stages were not recorded.” A coarse current phase can appear as “Last reported stage.” Do not parse log lines into stage facts.
- Keep the log viewer visible below the timeline and its error immediately adjacent to the failed stage. Add the same timeline to the existing full-screen operation dialog through its shared `details` slot.
- Explicitly describe existing build output as periodically refreshed captured output. Raw stdout streaming is not part of this change; the current command runner buffers output until a command completes.

### 6. Compatibility, security, and performance

API routes, response envelopes, permission checks, schemas, indexes, scheduling rules, retries, release paths, and host mutation order remain compatible. Events gain additional records using existing fields. Old UIs can ignore them; new UIs tolerate old workers. Do not add a Cancel button: types/links mention cancellation, but a callable cancellation endpoint is not present in this repository.

Render logs/errors as text through existing viewers; no HTML injection or raw event-details dump. New stage messages are fixed labels and IDs, excluding configuration snapshots, commands with credentials, and environment values. Existing backend redaction remains the event boundary.

Only selected panels mount log viewers. No per-card event streams, telemetry calls, timers, screenshots, or remote assets. Search/filter and stage derivation are pure and memoized where useful. Keep collection order stable while polling. Large history uses initial 10 operations and 10 releases with explicit Show more increments of 10; do not mount every historical log viewer. Existing bounded backend history remains the data source, with no promise of full archival history.

Use status icons plus text, visible focus rings, readable theme-token contrast, and polite announcements for meaningful operation transitions only. Audit warning badge text contrast in both themes and use foreground text plus a semantic icon where the token pair is insufficient. Workspace/overlays must fit 320px width and 200% zoom, preserve touch targets, and return focus correctly.

## Files To Change

All paths are relative to the repository root. New component interfaces should use named typed props. Reuse shared primitives without changing their defaults.

| File                                                              | Action                   | Detailed change                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/apps/page.tsx`                                           | Modify                   | Update local-only subtitle; preserve ProShell and route structure.                                                                                                                                                                |
| `src/modules/apps/ui/AppsPage.tsx`                                | Modify                   | Compose collection/workspace, own selection/filter/notices, retain and extend the single poller, unify per-app mutation guards, track all accepted operation types, and remove expanded-card/dialog destinations after migration. |
| `src/modules/apps/ui/AppsSummaryCards.tsx`                        | Modify                   | Compact responsive summary and last-known qualifier; preserve counts.                                                                                                                                                             |
| `src/modules/apps/ui/appPresentation.ts`                          | Add                      | Pure search/filter/sort, finite runtime formatting, source/domain/monogram formatting, relative time and card presentation types. Move applicable existing helpers here.                                                          |
| `src/modules/apps/ui/autoUpdatePresentation.ts`                   | Add                      | Extract automation precedence and diagnostic model shared by compact/detail views.                                                                                                                                                |
| `src/modules/apps/ui/appOperationPresentation.ts`                 | Add                      | Operation-target/observation types, validated durable/event readers, identity correlation, logical counts, stage reduction, freshness and terminal precedence. Move applicable existing helpers from AppsPage.                    |
| `src/modules/apps/ui/components/AppsCollectionToolbar.tsx`        | Add                      | Search, status filters, result count, grid/list preference controls.                                                                                                                                                              |
| `src/modules/apps/ui/components/AppCard.tsx`                      | Add                      | Compact grid/list variants, identity/state/metrics/actions/progress preview; no fetches or timers.                                                                                                                                |
| `src/modules/apps/ui/components/AutoUpdateSummary.tsx`            | Add                      | Compact automation state and accessible link to detailed Overview disclosure.                                                                                                                                                     |
| `src/modules/apps/ui/components/AutoUpdateStatus.tsx`             | Modify                   | Consume extracted state/relative-time helpers, preserve detail fields, update copy and infrastructure notice presentation.                                                                                                        |
| `src/modules/apps/ui/components/AppWorkspace.tsx`                 | Add                      | Drawer shell, four accessible tabs, Overview/Settings content, environment reveal/copy lifecycle, latest app by ID supplied by parent.                                                                                            |
| `src/modules/apps/ui/components/AppConfigurationDialog.tsx`       | Add                      | Extract create/edit form and form mapping helpers; shared Dialog, guarded draft lifecycle, inline validation/errors.                                                                                                              |
| `src/modules/apps/ui/components/AppDeploymentsPanel.tsx`          | Add                      | Active/selected operations, bounded release history, rollback action, inline viewer and fullscreen linkage.                                                                                                                       |
| `src/modules/apps/ui/components/AppDeploymentProgress.tsx`        | Add                      | Accessible stage groups/substeps, durations, stale and historical fallback, error/recovery display.                                                                                                                               |
| `src/modules/apps/ui/components/AppRuntimeLogsPanel.tsx`          | Add                      | Existing runtime log rendering as a tab panel with explicit Refresh and keyed request state supplied by AppsPage.                                                                                                                 |
| `src/modules/apps/ui/components/AppsOperationLogsDialog.tsx`      | Modify                   | Accept optional canonical operation status and progress presentation; use shared dialog details slot without coercing cancelled/unavailable to running or deployment failure.                                                     |
| `src/modules/apps/ui/components/AppsDeploymentHistoryDialog.tsx`  | Delete                   | Migrate release-history behavior into AppDeploymentsPanel; remove the sole AppsPage import.                                                                                                                                       |
| `src/modules/apps/ui/AppsRuntimeLogsDialog.tsx`                   | Delete                   | Migrate contents into AppRuntimeLogsPanel; remove the sole AppsPage import.                                                                                                                                                       |
| `src/modules/apps/types.ts`                                       | Modify                   | Add typed AppStageUpdate; do not change existing wire shapes or enum values.                                                                                                                                                      |
| `src/lib/apps/repositories/operation-repository.ts`               | Modify                   | Add fenced advisory stage reporter and injectable input/output contract.                                                                                                                                                          |
| `src/lib/apps/worker/runner.ts`                                   | Modify                   | Provide optional typed reporter bound to current operation/worker/generation; integrate definite ownership mismatch with existing abort handling.                                                                                 |
| `src/lib/apps/worker/legacy-executor.ts`                          | Modify                   | Pass durable identity/reporter through execution; emit preflight and coarse deletion stages.                                                                                                                                      |
| `src/lib/apps/service.ts`                                         | Modify                   | Correlate deploy/rollback rows, emit source/rollback/finalization stages, pass reporter through deployPreparedApp, remove coarse unfenced build-phase assignment.                                                                 |
| `src/lib/apps/deploy.ts`                                          | Modify                   | Add optional stage callback and report actual boundaries and failures while preserving command order, onProgress output, and recovery.                                                                                            |
| `src/modules/apps/ui/appPresentation.test.ts`                     | Add                      | Formatting, filters, stable ordering, local/Git/finite-value edge cases.                                                                                                                                                          |
| `src/modules/apps/ui/autoUpdatePresentation.test.ts`              | Add                      | Complete decision precedence, including stale and failed-outcome coexistence.                                                                                                                                                     |
| `src/modules/apps/ui/appOperationPresentation.test.ts`            | Add                      | Correlation, queue deduplication, stage event reduction, sparse history, terminal authority, malformed payloads.                                                                                                                  |
| `src/modules/apps/ui/components/AppCard.test.tsx`                 | Add                      | Card/list parity, accessible actions, stale warnings, busy state, public URL scheme.                                                                                                                                              |
| `src/modules/apps/ui/components/AppWorkspace.test.tsx`            | Add                      | Tab keyboard behavior, fresh selection, nested overlay restoration, disappearance and environment masking.                                                                                                                        |
| `src/modules/apps/ui/components/AppDeploymentProgress.test.tsx`   | Add                      | Stage/error semantics, queued/unchanged/cancelled/history/stale rendering.                                                                                                                                                        |
| `src/modules/apps/ui/AppsRuntimeLogsDialog.test.tsx`              | Move/modify              | Move to `src/modules/apps/ui/components/AppRuntimeLogsPanel.test.tsx`; retain log-content checks and add refresh/error behavior. Move overlay-focus expectations to workspace tests.                                              |
| `src/modules/apps/ui/AppsPage.test.tsx`                           | Modify                   | Update interactions for cards/workspace; retain all action and form assertions. Add rollback/delete 202 tracking, cross-action guard, selected-operation pagination and races. Move pure-helper tests to named helper test files. |
| `src/modules/apps/ui/AppsPage.auto-update.test.tsx`               | Modify                   | Preserve idle refresh, expired history, worker loss, and stale snapshot tests through the compact/detail entry points.                                                                                                            |
| `src/modules/apps/ui/AppsSummaryCards.test.tsx`                   | Modify                   | Verify count semantics and stale qualifier in compact layout.                                                                                                                                                                     |
| `src/modules/apps/ui/components/AutoUpdateStatus.test.tsx`        | Modify                   | Preserve detailed field, latest-log, overdue, retry, pause, and cancellation coverage.                                                                                                                                            |
| `src/modules/apps/ui/components/AppsOperationLogsDialog.test.tsx` | Modify                   | Preserve independent log controls/focus and cover canonical terminal status/progress details.                                                                                                                                     |
| `src/lib/apps/repositories/operation-repository.test.ts`          | Modify                   | Fence mismatch, terminal protection, expired lease, advisory event failure, phase updates.                                                                                                                                        |
| `src/lib/apps/worker/runner.test.ts`                              | Modify                   | Reporter binding, nonfatal observability failure, lease mismatch abort, unchanged renewal/deadline behavior.                                                                                                                      |
| `src/lib/apps/worker/legacy-executor.test.ts`                     | Add                      | Durable ID/reporting propagation, early cancellation, operation-specific stages using mocked services.                                                                                                                            |
| `src/lib/apps/deploy.test.ts`                                     | Modify                   | Stage ordering and failures/recovery/TLS skip alongside existing actual command-order assertions.                                                                                                                                 |
| `src/lib/apps/service.test.ts`                                    | Modify                   | Deploy/rollback durable linkage, finalization timing, preserved release/rollback behavior.                                                                                                                                        |
| `src/lib/apps/service.update.test.ts`                             | Modify                   | Git unchanged skips deployment, actual stage reporting, failure and retry/deployed-SHA invariants.                                                                                                                                |
| `e2e/apps.spec.ts`                                                | Modify                   | Adapt old flows; add responsive collection/workspace, mocked staged operation, stale/worker-loss, keyboard and screenshot scenarios.                                                                                              |
| `docs/apps-auto-update.md`                                        | Modify                   | New Check & deploy label, compact/expanded status locations, queued/last-known semantics, unchanged rollback pause.                                                                                                               |
| `CLAUDE.md`                                                       | Modify at implementation | Update Workspace Index for added/replaced Apps UI and stage reporting files. Do not alter project policies.                                                                                                                       |

Also modify `src/components/operations/operation-status.ts` to add the neutral `unknown` presentation, and `src/components/operations/operation-status.test.ts` to verify its label/non-live behavior and preserve existing mappings. Run `pnpm test src/components/operations` with the Apps UI tests. These are the only shared operations changes; the existing viewer/dialog consume the additive status without layout modifications.

No change is expected in Mongo models, global theme files, shared overlay defaults, API route implementations, package manifests, lockfiles, or AppsWidget.

## Implementation Phases

### Phase 1: Extract presentation contracts and retain behavior

1. Add `appPresentation.ts`, `autoUpdatePresentation.ts`, and `appOperationPresentation.ts` with their focused tests. Move current summary/operation helpers without weakening semantics; update test imports.
2. Extract the auto-update decision tree, keeping the detailed component operational with the old page while tests establish parity.
3. Add relative-time/finite-metric formatting and the explicit observation/terminal precedence types.
4. Checkpoint: existing Apps tests plus new pure tests pass before replacing entry/detail presentation.

### Phase 2: Add structured execution evidence

Depends on phase 1's presentation contract.

1. Add `AppStageUpdate`, repository reporter, and runner injection with ownership/event-failure tests.
2. Pass durable IDs/reporter through legacy-executor, service options, deployPreparedApp, and deployNextJsApp. Add queueOperationId for manual deploy and rollback.
3. Instrument boundaries from the stage table, including source failure, unchanged checks, finalization, TLS skip/reuse, and recovery. Remove the coarse build assignment only after real reporting is wired.
4. Keep textual log output intact. Run deploy/service/update/worker/repository tests to prove unchanged host-action ordering and recovery.
5. Checkpoint: mocked execution produces correct sequenced stage events; no migration is required and the old UI remains usable.

### Phase 3: Build the compact collection

Depends on phase 1; does not require phase 2 to be deployed.

1. Implement toolbar, AppCard grid/list variants, AutoUpdateSummary, and compact summary.
2. Wire search/filter/local preference and collection states into AppsPage. Replace duplicated infrastructure banners with the shared notice and per-app concise markers.
3. Add one display clock and request receive-time metadata. Ensure stale state changes every applicable status surface, including counts and metrics.
4. Keep current detail entry handlers temporarily available until phase 4 replaces their destinations; do not remove access to any action between steps.

### Phase 4: Move details into the app workspace

Depends on phase 3.

1. Extract AppConfigurationDialog and migrate existing form behavior, preserving field mappings and draft lifecycle.
2. Add AppWorkspace, runtime logs panel, and deployments panel. Resolve selection by ID; implement tabs and focus handling.
3. Move runtime details, automation disclosure, source/TLS/DNS/commands/env presentation, and releases into their specified tabs. Add explicit runtime-log Refresh with request ID guards.
4. Route card actions to workspace destinations; move deletion into Settings. Keep full-screen operation logs as a shared nested overlay.
5. Delete old history/runtime wrappers and expanded-card JSX/state only after behavior tests pass. Update Workspace Index.

### Phase 5: Integrate operation progress and asynchronous actions

Depends on phases 2 and 4.

1. Extend the existing polling effect with durable observations and bounded selected-operation events, including terminal drain and expired-history handling.
2. Add AppDeploymentProgress and integrate it into AppDeploymentsPanel and the full-screen dialog. Render legacy fallback for absent events.
3. Unify pending guards and accepted lock handling for all four mutation types. Retain deleted app display identity until terminal feedback is resolved.
4. Preserve follow/autoscroll/wrap states and actual execution-log preference; use canonical durable status separately from compatibility logs.
5. Add race, failure, pagination, acceptance, stale-lock, and terminal-precedence tests before visual polish.

### Phase 6: Polish, verify, and document

Depends on all preceding phases.

1. Verify layout at 320, 390, 768, 1024, 1440, and 1920px with the real shell. Inspect light/dark and reduced-motion modes, long names, warnings, and 200% zoom.
2. Adapt E2E fixtures/routes for modern durable events and legacy responses. Verify the four-app density target and narrow-screen workspace without hidden controls.
3. Update auto-update docs and run required repository checks. Review diff for unrelated changes and accidental sensitive fixture content.
4. Hand off implementation, evidence, and any environment limitations. Do not operate production apps as part of automated verification.

## Testing Plan

Tests should verify behavior and safety boundaries, not mirror every CSS class or extraction. Update old selectors intentionally rather than deleting old behavioral coverage.

| Test                       | File or command                                                                                                                                                 | Purpose                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Pure presentation          | `pnpm test src/modules/apps/ui/appPresentation.test.ts src/modules/apps/ui/autoUpdatePresentation.test.ts src/modules/apps/ui/appOperationPresentation.test.ts` | Relative times, correct source/SHA selection, missing vs zero metrics, all automation states, correlation and stage authority.     |
| Apps UI                    | `pnpm test src/modules/apps/ui`                                                                                                                                 | CRUD/form parity, collection navigation, tabs, masking, locks, stale states, logging, and existing widget behavior.                |
| Deployment backend         | `pnpm test src/lib/apps/deploy.test.ts src/lib/apps/service.test.ts src/lib/apps/service.update.test.ts src/lib/apps/worker src/lib/apps/repositories`          | Real stage boundaries with mocked commands, no host-action reordering, ownership fencing, event failures, and durable linkage.     |
| API regression             | `pnpm test src/app/api/modules/apps`                                                                                                                            | Existing 202 envelopes, authentication, 409/503 handling and events compatibility remain intact.                                   |
| Browser flows              | `pnpm exec playwright test e2e/apps.spec.ts --project=chromium`                                                                                                 | Initial targeted browser pass; actual keyboard/focus/overlay and layout behavior.                                                  |
| Browser compatibility      | `pnpm exec playwright test e2e/apps.spec.ts`                                                                                                                    | Existing configured desktop and mobile projects.                                                                                   |
| Required repository checks | `pnpm format:check` then `pnpm check`                                                                                                                           | Format separately, then release contract, lint with no warnings, types, production build, and full tests as required by CLAUDE.md. |

Required regression scenarios:

- One queued durable row plus its execution counts once. Historical selection does not replace live operation tracking.
- Fast Deploy then Check & deploy sends one mutation. A 503 does not create a phantom accepted operation or leave an unaccepted spinner running.
- List refresh fails immediately after enqueue; lock and last observed app remain. Later terminal detail plus successful list refresh releases the lock.
- Queued rollback pauses automation only after actual backend completion; queued deletion remains Queued/Removing until terminal evidence.
- Operation completes before execution logs start, is cancelled, expires, or becomes inaccessible. Each state has truthful copy and bounded polling.
- Events are duplicate, out of order, malformed, full-page paginated, missing completion, or arrive after terminal state. None manufactures success or restarts a finished timeline.
- Switching operation A to B while A's events arrive late leaves B unchanged; the same applies to runtime logs and list request generations.
- Unchanged Git check skips deployment; disabled TLS is skipped; local app never claims a Git fetch; build/source/health/routing failures identify only stages with evidence.
- Definite lease mismatch cannot update phase or allow new host mutations; event storage failure does not fail an otherwise successful deployment.
- Full-screen logs retain independent follow/autoscroll/wrap and copy/download behavior. Closing nested overlays restores the appropriate workspace control.
- Search/filter/view changes preserve action accessibility. No-results and no-apps states differ. Stored preference failures do not break hydration/rendering.
- Stale snapshot removes unqualified Running/Up to date across card, workspace, and summary; recovery clears stale warnings. Known scheduler failure does not imply the app runtime stopped.
- Environment values remain hidden on initial entry/re-entry, and a slow polling response never overwrites an edit draft.

Browser tests must intercept Apps mutations, runtime logs, operation details, and events. Use fixture-generated admin sessions following the current E2E pattern and an explicit test JWT secret/environment where needed. Never use a real deploy/delete/rollback endpoint to verify this redesign. Keep screenshot artifacts in ignored test output, with no credentials or actual environment values.

## Edge Cases

- Missing Git object: render source unavailable and suppress Git-specific actions instead of throwing; Settings remains accessible.
- Unknown app status, nonfinite metrics, invalid timestamps: explicit Unknown/em-dash fallback; never green or zero by coercion.
- Very long app names, branch names, domains, paths, and error text: wrap or truncate visually with an accessible full value in the workspace; no overflowing action rows.
- Running old release while an update fails: runtime/managed status and latest failed operation remain separate. A build failure does not automatically claim the service is down.
- User opens a successful historical deployment while another runs: show historical status in the selected panel plus an active-operation return link.
- Selected app removed by another browser: close only after a successful list refresh, preserving deletion feedback if locally queued.
- Create/edit response succeeds but subsequent list refresh fails: report save success with refresh warning; do not imply the save failed or resubmit automatically.
- Worker restart or mixed web/worker versions: fall back to coarse progress; release workers should be restarted through normal supervised drain procedures.
- Missing event pages from old history or advisory persistence failures: timeline marks unrecorded stages; overall terminal status remains authoritative.
- Automatic rollback recovery after a failed deployment: show failed outcome with recovery activity, not a successful deployment.
- Clock skew and tab suspension: recalculate ages from receive-time/server-time metadata on resume; invalid elapsed intervals display unavailable rather than negative durations.

## Risks And Mitigations

- **Large UI extraction loses behavior:** move pure helpers and form first, preserve existing regression assertions, and complete one destination at a time.
- **A polished timeline overstates certainty:** structured stage events, explicit sparse-history fallback, and durable terminal precedence are required release criteria.
- **Stage reporting changes deployment resilience:** keep it advisory, test persistence failures, preserve original catch/recovery and command order, and route definite ownership loss through existing worker protection.
- **More event traffic or timer churn:** one coordinator, selected-operation events only, capped pages/concurrency/history, request-generation guards, no dependencies on changing clock values in networking effects.
- **Nested dialogs break keyboard navigation:** shared overlays only; test topmost Escape, inert backgrounds, dirty-form confirmation, and opener restoration in a real browser.
- **Compact layout hides actionable errors:** warning label and latest failed outcome stay on the card; one action exposes the full error and logs.
- **Stale state presented as live:** freshness is an explicit input to every presentation layer and tested across all entry/detail surfaces.
- **False success after rollback/delete acceptance:** track their durable IDs exactly as deploy/update and require terminal evidence.

## Rollout And Rollback

1. Implement in the ordered phases above; keep the branch deployable and compatibility fallbacks working throughout.
2. No data migration, dependency installation, database index change, or feature-flag infrastructure is required. Stage events are additive and optional to consumers.
3. Run mocked browser checks first, then validate on a development/staging Linux host with a disposable app using normal deployment authorization. Confirm list/worker health, real install/build/health stages, unchanged Git check, and failure recovery. This is an implementation rollout instruction, not permission to operate production from this planning task.
4. Deploy through the existing release process and restart the supervised Apps worker after it drains active execution. Do not interrupt a deployment just to enable the new visuals.
5. Observe existing worker/operation logger output for stage-reporting errors and compare actual operation outcomes with the UI. No new telemetry service is needed.
6. Roll back web/UI changes to restore the previous entry screen if required. New progress events are harmless to the older UI. If reporter behavior is implicated, revert the backend reporting commits through the normal worker drain/restart process too. Do not delete historical events or release data.

## Non-Goals

- New deployment engine, release strategy, container support, runtime process-control actions, cancellation endpoint, or worker scheduling policy.
- CPU/memory historical storage, sparklines, uptime percentages, request latency, fleet activity feed, app screenshots, remote favicons, or custom artwork management.
- New global design system, fonts, dark-theme palette, navigation shell, or changes to other modules.
- Raw stdout streaming, new WebSocket/SSE connections, operation-history archival service, or event log redesign.
- Deep-link routing, persisted app/workspace data, multi-selection, or bulk deployment.
- Broad backend security/refactoring work outside the explicit stage-reporting and operation-correlation requirements.

## Implementer Handoff Checklist

- [x] Requirements and visual direction are explicit; conservative scope assumptions are recorded.
- [x] Current implementation, operation contracts, tests, theme, and overlays were inspected.
- [x] Files to add/modify/delete and component responsibilities are named.
- [x] Phases and their dependencies are ordered.
- [x] Progress reporting distinguishes emitted evidence from inferred or unavailable history.
- [x] Async acceptance, lock retention, stale snapshots, cancellation status, and expired history are specified.
- [x] Tests, browser scenarios, required checks, and environment limitations are listed.
- [x] Security, accessibility, performance, rollout, and rollback are covered.
- [ ] Implement phases 1–6 and record actual verification results before claiming the redesign complete.
