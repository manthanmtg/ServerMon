# Accessible Operations UI Design

- **Date:** 2026-08-20
- **Status:** Approved for implementation
- **Project:** ServerMon
- **Source:** UI/UX priorities selected from `docs/CODEBASE_IMPROVEMENT_AUDIT_2026-08-20.md`

## Purpose

Create a consistent, accessible, and resource-efficient interaction model for ServerMon dialogs, drawers, destructive confirmations, live operation logs, and recurring browser polling.

The work must preserve ServerMon's existing visual language while fixing unsafe keyboard confirmation, removing duplicated accessibility logic, extending the improved Apps deployment-log experience to other long-running operations, restoring browser zoom, respecting reduced-motion preferences, and deduplicating repeated client data requests.

## Goals

1. Destructive confirmations cannot be submitted by keyboard unless the visible confirmation requirements are satisfied.
2. Dialogs and drawers share one tested accessibility contract.
3. Every user-visible long-running operation uses the same status and log interaction vocabulary.
4. Live log controls appear only while output is live and behave consistently.
5. Users can zoom normally and can request reduced motion without losing information.
6. Equivalent browser consumers share polling and in-flight requests instead of creating redundant traffic.
7. Existing feature behavior and ServerMon's visual design remain recognizable.

## Non-goals

- Replacing ServerMon's color palette, typography, navigation, or overall visual identity.
- Replacing the backend job models or adding durable cancellation semantics; those are separate reliability/security projects.
- Adding a third-party component or query library.
- Combining every domain operation into one backend service.
- Rewriting all large feature pages as part of this work.
- Virtualizing log output in the first migration. The shared log surface will expose a stable boundary so virtualization can be added later.

## Design principles

- **Safety is behavioral:** keyboard shortcuts and visible buttons use the same predicate.
- **Accessibility is structural:** focus, semantics, scroll locking, and background isolation live in primitives rather than feature code.
- **Operational status is explicit:** submitting, queued, running, succeeded, failed, and canceled are not conflated.
- **Live controls are contextual:** follow and autoscroll appear for running streams, not static history.
- **No color-only meaning:** every status retains a text label and, where helpful, an icon.
- **Motion is optional:** information and task completion never depend on animation.
- **Polling is cooperative:** consumers share data, pause when hidden/offline, cancel obsolete work, and back off after failure.
- **Migration is incremental:** features can adopt shared pieces without changing their backend payloads.

## Current-state problems

### Confirmation safety

`ConfirmationModal` disables its button when verification text does not match, but its document-level Enter handler invokes `onConfirm` without checking that condition. The modal also implements only part of the expected focus lifecycle.

### Dialog and drawer duplication

Apps operation logs implement focus trapping, focus restoration, Escape handling, and body scroll locking locally. Other modals and drawers repeat incomplete variations. This creates inconsistent keyboard behavior and makes every new dialog a regression risk.

### Operation log inconsistency

Apps, Updates, Cron runs, AI Runner, self-service installs, fleet install/update, executable endpoint results, and service/runtime logs use different controls, labels, sizes, focus behavior, empty states, and autoscroll rules.

### Motion and zoom

The root viewport disables zoom with `maximumScale: 1`. CSS and Framer Motion animations do not share a user-preference boundary.

### Polling duplication

Feature pages and widgets often maintain independent `setInterval` loops. Several metrics widgets create EventSource connections even though a shared `MetricsContext` exists. Pollers do not consistently deduplicate, pause while hidden, cancel in-flight work, or back off after errors.

## Architecture

The implementation adds four layers:

1. **Overlay foundation:** internal hooks and primitives for dialog/drawer accessibility.
2. **Operation presentation:** reusable status and log surfaces built on the overlay foundation.
3. **Preference foundation:** application-level reduced-motion configuration and global CSS fallback.
4. **Shared resource polling:** a small external-store registry plus a React hook for deduplicated recurring requests.

Feature modules retain their domain data fetching and status mapping. They adapt domain values into shared presentation props rather than coupling the shared components to Apps, Updates, Cron, Fleet, or AI types.

## Component and hook design

## 1. Overlay foundation

### `useOverlayAccessibility`

Location: `src/components/ui/overlay/useOverlayAccessibility.ts`

Responsibilities:

- capture the previously focused element when an overlay opens;
- set initial focus to an explicit ref or the first focusable element;
- trap Tab and Shift+Tab inside the active overlay;
- close on Escape when allowed;
- restore focus when the overlay closes, with a safe fallback when the trigger is gone or disabled;
- lock body scrolling without losing the prior inline overflow value;
- mark non-overlay body siblings inert and `aria-hidden`, restoring their exact prior state afterward;
- support nested overlays through a module-level stack so only the top overlay handles Escape and Tab;
- use stable callback refs so consumers do not reinstall global handlers on every render.

The hook must not close on Escape while `dismissible` is false, such as during a non-interruptible destructive mutation.

### `Dialog`

Location: `src/components/ui/Dialog.tsx`

API shape:

```ts
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
  dismissible?: boolean;
  closeLabel?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  contentClassName?: string;
}
```

Behavior:

- renders through `createPortal` into `document.body` after mount;
- emits `role="dialog"`, `aria-modal="true"`, and unique title/description IDs;
- provides a 44×44 close control when dismissible;
- closes on the backdrop only when dismissible;
- applies the overlay accessibility hook;
- uses `min(92dvh, ...)` and safe-area padding;
- keeps content and footer regions independently composable.

### `AlertDialog`

Location: `src/components/ui/AlertDialog.tsx`

Built on the same overlay foundation but emits `role="alertdialog"`. It accepts an explicit cancel and action area. Initial focus defaults to the least destructive action unless verification input needs focus.

### `Drawer`

Location: `src/components/ui/Drawer.tsx`

Uses the same focus/background/scroll contract and portal. It supports `left` and `right` placement, full height using dynamic viewport units, safe-area padding, and responsive width. A drawer is not a navigation route and must always expose a close action.

## 2. Safe destructive confirmation

`ConfirmationModal` remains as a compatibility component so current callers do not all change simultaneously. Its presentation moves to `AlertDialog`.

The component derives one predicate:

```ts
const canConfirm = !isLoading && (!verificationText || inputValue === verificationText);
```

Both the button and Enter handler use `canConfirm`.

Enter behavior:

- does nothing when `canConfirm` is false;
- does nothing when the native event is composing;
- does nothing from `textarea`, `select`, or contenteditable controls;
- from the verification input, submits only after an exact match;
- prevents duplicate submission while loading;
- calls confirmation at most once for one key event.

The verification value resets whenever the modal closes or the required text changes.

## 3. Operation status and log presentation

### Shared status vocabulary

Location: `src/components/operations/operation-status.ts`

```ts
type OperationStatus =
  | 'submitting'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancel-requested'
  | 'canceled'
  | 'unchanged';
```

The shared module maps status to a label, badge variant, icon, and whether output is live. Feature adapters may override user-facing labels without altering semantics.

### `OperationLogViewer`

Location: `src/components/operations/OperationLogViewer.tsx`

API shape:

```ts
interface OperationLogViewerProps {
  output: string | readonly string[];
  status: OperationStatus;
  label: string;
  emptyMessage?: string;
  error?: string | null;
  follow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  autoscroll?: boolean;
  onAutoscrollChange?: (autoscroll: boolean) => void;
  wrap?: boolean;
  onWrapChange?: (wrap: boolean) => void;
  onRequestFullscreen?: () => void;
  downloadableFilename?: string;
  maxHeightClassName?: string;
  className?: string;
}
```

Behavior:

- renders a semantic toolbar and a monospace output region;
- shows follow/autoscroll only for live statuses;
- follow controls whether a feature continues requesting/accepting live updates;
- autoscroll controls viewport movement and never silently re-enables after a user disables it;
- scrolls to a sentinel only when live and autoscroll is enabled;
- displays an explicit waiting/empty message;
- displays errors in `role="alert"` outside the log region;
- uses `role="log"` for live output with `aria-live="off"` by default to avoid announcing every line; a separate polite status summary announces state transitions;
- supports wrapping, copy, text download, and optional full-screen launch;
- preserves raw text exactly in copy/download;
- uses a bounded visible height while allowing full-screen expansion;
- keeps all toolbar controls at least 44 pixels high.

Copy/download controls appear when output exists. Full-screen appears when the feature supplies a handler.

### `OperationLogDialog`

Location: `src/components/operations/OperationLogDialog.tsx`

Combines `Dialog` and `OperationLogViewer` with:

- title, target/subtitle, status badge, timestamps, and optional operation ID;
- full-screen sizing;
- focus on close by default;
- durable controls during live updates;
- a close action that does not imply operation cancellation.

### `useOperationLogControls`

Location: `src/components/operations/useOperationLogControls.ts`

Owns follow, autoscroll, and wrap state for consumers that need both inline and dialog views. It can reset to defaults when the operation ID changes but must preserve user changes while the same operation runs.

## 4. Feature migration

### Apps

- Replace local focus-trap/scroll-lock code in `AppsOperationLogsDialog` with `OperationLogDialog`.
- Use `OperationLogViewer` for inline operation output.
- Keep the current operation reconciliation and queue/legacy-ID behavior unchanged.
- Keep separate Follow and Autoscroll semantics for a running operation.
- Use the shared controls state so inline and full-screen views agree.

### Updates

- Replace the custom active-run `<pre>` and icon-only autoscroll button with `OperationLogViewer`.
- Add full-screen `OperationLogDialog` for active and historical runs.
- Preserve current polling and result statuses until the shared polling migration in this project.
- Ensure the primary update action remains disabled through submission and running states.

### Cron runs

- Rebuild `RunOutputModal` using `OperationLogDialog`.
- Preserve “Run in Background” copy while a job is running.
- Use the common autoscroll and output empty-state behavior.

### AI Runner

- Rebuild `RunDetailDrawer` on `Drawer`.
- Replace its output pane with `OperationLogViewer`.
- Preserve stdout/stderr/raw-output sections and history navigation; only the active output section is treated as live.

### Self-service installation

- Use `OperationLogViewer` for step output in `InstallProgress`.
- Preserve the step timeline and security-related backend behavior unchanged.
- Only show live controls for a running job.

### Fleet install/update

- Replace duplicated autoscroll/output blocks in `NodeServerMonPanel` and `NodeStatusPanel` with the shared viewer.
- Keep remote operation status and polling adapters domain-specific.

### Endpoint execution

- Use `OperationLogViewer` for command output in `EndpointTestConsole` when the endpoint type produces execution logs.
- Keep structured request/response result panels separate from command logs.

### Runtime and service logs

- Adopt the common toolbar/viewer where raw output is presented, without labeling passive log monitoring as a finite operation.
- `AppsRuntimeLogsDialog` uses `Dialog`; service log polling uses the shared polling hook.

## 5. Reduced motion and zoom

### Viewport

Remove `maximumScale: 1` from `src/app/layout.tsx`. Keep `width`, `initialScale`, and `viewportFit`.

### Framer Motion

Create a client `MotionPreferencesProvider` that wraps children with:

```tsx
<MotionConfig reducedMotion="user">{children}</MotionConfig>
```

Insert it once in the root provider tree.

### CSS

Add a global `@media (prefers-reduced-motion: reduce)` block that:

- reduces transition duration and animation iteration globally without hiding content;
- disables decorative indeterminate, pulse, spin, shimmer, slide, scale, and smooth-scroll effects;
- preserves focus indication and instantaneous state changes;
- avoids `display: none` or opacity changes that remove information.

Feature animations should still remove unnecessary infinite motion explicitly when their semantics would be confusing.

## 6. Shared polling

### `useSharedPollingQuery`

Location: `src/lib/polling/useSharedPollingQuery.ts`

The hook is built on `useSyncExternalStore` and a module-level registry keyed by a stable string.

API shape:

```ts
interface SharedPollingOptions<T> {
  key: string;
  fetcher: (signal: AbortSignal) => Promise<T>;
  intervalMs: number;
  enabled?: boolean;
  initialData?: T;
  staleTimeMs?: number;
  maxBackoffMs?: number;
  pauseWhenHidden?: boolean;
  pauseWhenOffline?: boolean;
}

interface SharedPollingResult<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  updatedAt: number | null;
  refresh: () => Promise<void>;
}
```

Registry behavior:

- one cache entry and one in-flight request per key;
- reference-counted subscribers;
- immediate cached snapshot delivery;
- no overlapping requests;
- abort an in-flight request when the final subscriber leaves;
- schedule only while at least one enabled subscriber exists;
- pause while `document.hidden` or `navigator.onLine === false` when configured;
- refresh on visibility/online return when stale;
- exponential error backoff capped by `maxBackoffMs`, reset after success;
- deterministic small jitter derived from the key so clients do not synchronize exactly;
- ignore AbortError as a user-visible failure;
- support manual refresh shared by every subscriber;
- delete unused cache entries after a bounded idle retention period.

Fetcher identity is stable per key. Development mode warns if two mounted consumers use the same key with incompatible intervals or different fetcher identities.

### Polling migration order

1. Remove direct metrics EventSource usage from CPU, Memory, and Health widgets; consume `MetricsContext` exclusively.
2. Migrate simple page/widget pairs: services, ports, certificates, firewall, Nginx, hardware, security, databases, and Apps summaries.
3. Migrate service logs and passive log polling.
4. Migrate Updates active runs, Cron active runs, self-service progress, Fleet endpoint results, and other finite operations where the hook fits.
5. Keep bespoke event streams such as AI Runner SSE and Socket.IO sessions, but reuse visibility/reconnect conventions rather than forcing them into an interval abstraction.

The hook does not replace server-side schedulers or backend worker polling.

## Data flow

### Overlay

1. Feature sets `open=true`.
2. Dialog portals into the body and registers as the top overlay.
3. Accessibility hook stores focus, locks scroll, isolates background siblings, and chooses initial focus.
4. User dismisses through close, backdrop, or Escape when permitted.
5. Hook restores all modified DOM state and returns focus.

### Operation logs

1. Feature fetches or streams its domain operation.
2. Feature adapter maps domain status and output into shared props.
3. Shared controls determine whether live polling continues and whether the viewport moves.
4. State changes are announced through a concise status summary; raw logs remain readable without line-by-line announcements.
5. Full-screen view consumes the same output and control state.

### Shared polling

1. First subscriber creates a registry entry and initiates a request.
2. Later subscribers receive the same snapshot and share the in-flight promise.
3. Successful data updates all subscribers and schedules the next interval.
4. Failure preserves previous data, exposes an error, and increases backoff.
5. Hidden/offline state pauses timers; return triggers a stale refresh.
6. Final unsubscription aborts work and starts idle-cache expiration.

## Error handling

- Overlay cleanup is idempotent and restores exact pre-existing DOM attributes/styles.
- Clipboard failure leaves output visible and produces a user-facing error state or toast when a callback is provided.
- Download uses a short-lived object URL and always revokes it.
- Polling preserves the last successful value when a refresh fails.
- Polling never treats `AbortError` as an application failure.
- Feature adapters continue to own domain-specific error messages and retry actions.
- A failed full-screen dialog migration must not remove the existing inline output path until tests demonstrate parity.

## Accessibility contract

Every migrated overlay must satisfy:

- dialog or alertdialog role with accessible name;
- optional accessible description;
- initial focus inside the overlay;
- Tab and Shift+Tab containment;
- Escape behavior only when dismissible;
- background content inert and hidden from assistive technology;
- restored focus after dismissal;
- 44×44 controls;
- no reliance on color, hover, animation, or gesture alone;
- usable layout at 375 CSS pixels and at 200% zoom;
- no animation requirement when reduced motion is enabled.

Every operation log must satisfy:

- accessible label and explicit state text;
- no line-by-line screen-reader flood;
- keyboard-accessible toolbar;
- visible focus;
- live-only controls shown only while running;
- exact copy/download content;
- readable wrapping or horizontal scrolling chosen by the user.

## Testing strategy

Implementation follows red-green-refactor. Each production behavior begins with a failing test.

### Overlay unit/component tests

- portal rendering and semantic IDs;
- initial focus, Tab wrap, Shift+Tab wrap, Escape, backdrop policy;
- focus restoration when trigger exists, is disabled, or is removed;
- body overflow and background inert/aria-hidden restoration;
- nested overlay top-of-stack behavior;
- non-dismissible state.

### Confirmation tests

- unmatched verification plus Enter does not confirm;
- matched verification plus Enter confirms once;
- loading plus Enter does not confirm;
- composing, textarea, select, and contenteditable Enter do not confirm;
- verification resets between openings;
- button and key path share disabled semantics.

### Operation log tests

- status mapping and live-control visibility;
- follow/autoscroll/wrap changes;
- sentinel scroll only when live and enabled;
- errors, empty/waiting states, exact copy, and exact download;
- full-screen action and accessible naming;
- control state persists for the same operation and resets for a different one.

### Polling tests

- same key performs one request for multiple consumers;
- cached state is shared;
- no overlapping request;
- unsubscribe abort;
- hidden/offline pause and resume;
- stale refresh;
- failure backoff and success reset;
- manual refresh deduplication;
- idle cache cleanup.

### Feature regression tests

Update existing Apps, Updates, Cron, AI Runner, self-service, Fleet, endpoint, runtime-log, and service-log tests to assert the shared user-visible behavior instead of private implementation details.

### Browser verification

Use Playwright for:

- keyboard-only destructive confirmation;
- opening/closing and focus restoration;
- Tab trapping in dialog/drawer;
- full-screen live logs with follow/autoscroll;
- 375px mobile viewport;
- 200% zoom layout;
- reduced-motion emulation;
- hidden-tab polling pause where browser automation supports it.

### Repository verification

- targeted tests after each TDD cycle;
- all touched-file tests;
- `pnpm test`;
- `pnpm typecheck` with pre-existing failures distinguished from new failures;
- `pnpm lint`;
- `pnpm format:check` or a touched-file Prettier check while repository-wide format debt remains;
- `pnpm build`;
- targeted Playwright flows.

## Migration safety

- Preserve compatibility exports for `ConfirmationModal` and `AutoscrollButton` during migration.
- Do not change backend payloads solely to fit shared UI types.
- Migrate one feature at a time with its existing regression tests green.
- Keep full-screen close separate from canceling an operation.
- Do not disable polling merely because an inline log is collapsed when the operation must still update global state.
- If a resource query has feature-specific parameters, include all of them in its stable polling key.

## Rollout order

1. Overlay accessibility hook and primitives.
2. Confirmation safety migration.
3. Operation status, controls, viewer, and dialog.
4. Apps migration as the reference implementation.
5. Updates and Cron migration.
6. AI Runner drawer migration.
7. Self-service, Fleet, endpoint, runtime, and service log migrations.
8. Zoom and reduced-motion foundation plus feature cleanup.
9. Shared polling registry and simple duplicate consumers.
10. Finite-operation polling migration.
11. Full verification and accessibility/browser review.

## Acceptance criteria

The project is complete when:

1. Typed destructive confirmations cannot be bypassed with Enter.
2. Shared dialogs/drawers pass focus, Escape, background isolation, scroll-lock, and restoration tests.
3. The identified long-running workflows use the shared log/status interaction contract.
4. Follow and autoscroll are available only for live operations and retain independent meanings.
5. Browser zoom is not disabled.
6. CSS and Framer Motion honor the user's reduced-motion preference.
7. Direct duplicate metrics streams are removed and migrated polling consumers share requests by key.
8. Hidden/offline polling pauses and resumes without overlapping requests.
9. Existing feature tests plus new shared-component/hook tests pass.
10. Build output contains no new type, lint, format, or accessibility regressions attributable to this work.
