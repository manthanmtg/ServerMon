# Accessible Operations UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver shared accessible overlays and operation logs, safe destructive confirmation, user-controlled motion and zoom, and deduplicated browser polling across ServerMon's long-running workflows.

**Architecture:** Dependency-free UI primitives centralize portal, focus, Escape, background isolation, and scroll locking. Domain features adapt existing operation types to shared log/status components. A `useSyncExternalStore` registry shares polling by resource key and pauses it based on visibility/connectivity without replacing specialized SSE or Socket.IO flows.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Framer Motion, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-20-accessible-operations-ui-design.md`

## Global constraints

- Add no UI, focus-trap, or query dependency.
- Preserve current visual language and domain payloads.
- Follow red-green-refactor and observe every new behavior test fail first.
- Closing a log view never cancels its operation.
- Follow and autoscroll remain independent and appear only for live output.
- Never disable browser zoom; information must not depend on motion.
- Polling keys include all parameters affecting the returned resource.
- Keep specialized SSE and Socket.IO flows specialized.
- Keep unrelated user changes and the untracked audit report out of feature commits unless explicitly included at final documentation sync.

## New shared files

- `src/components/ui/overlay/useOverlayAccessibility.ts` and test
- `src/components/ui/Dialog.tsx` and test
- `src/components/ui/AlertDialog.tsx` and test
- `src/components/ui/Drawer.tsx` and test
- `src/components/operations/operation-status.ts` and test
- `src/components/operations/useOperationLogControls.ts` and test
- `src/components/operations/OperationLogViewer.tsx` and test
- `src/components/operations/OperationLogDialog.tsx` and test
- `src/components/providers/MotionPreferencesProvider.tsx` and test
- `src/lib/polling/useSharedPollingQuery.ts` and test

---

### Task 1: Overlay accessibility foundation

**Files:**

- Create: `src/components/ui/overlay/useOverlayAccessibility.ts`
- Create: `src/components/ui/overlay/useOverlayAccessibility.test.tsx`
- Create: `src/components/ui/Dialog.tsx`
- Create: `src/components/ui/Dialog.test.tsx`
- Create: `src/components/ui/AlertDialog.tsx`
- Create: `src/components/ui/AlertDialog.test.tsx`
- Create: `src/components/ui/Drawer.tsx`
- Create: `src/components/ui/Drawer.test.tsx`

**Interfaces:** Produces the overlay hook and three primitives specified in the design. Later tasks must not implement local focus traps, global Escape handlers, body scroll locks, or background isolation.

- [x] **Step 1: Write failing overlay lifecycle tests**

Create a real harness and assert initial focus, forward/backward Tab wrapping, Escape, trigger restoration, disabled/removed trigger fallback, exact body-overflow restoration, exact `inert`/`aria-hidden` restoration, nested top-overlay behavior, and a non-dismissible overlay.

    it('moves focus inside, traps Tab, and restores the trigger', () => {
      render(<OverlayHarness />);
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
      fireEvent.keyDown(window, { key: 'Tab' });
      expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
    });

- [x] **Step 2: Run the hook test and verify RED**

  pnpm test src/components/ui/overlay/useOverlayAccessibility.test.tsx

Expected: module-not-found failure.

- [x] **Step 3: Implement the minimum stack and lifecycle hook**

Use a module-level stack of unique symbols and this focusable selector:

    const focusableSelector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

Store every modified DOM value and restore it idempotently. Only the top stack token handles keys.

- [x] **Step 4: Run the hook test and verify GREEN**

- [x] **Step 5: Write failing primitive tests**

Assert portal placement under `document.body`, roles and accessible IDs, 44-pixel close targets, dismissible backdrop/Escape behavior, focus behavior, and left/right drawer placement.

- [x] **Step 6: Run primitive tests and verify RED**

  pnpm test src/components/ui/Dialog.test.tsx src/components/ui/AlertDialog.test.tsx src/components/ui/Drawer.test.tsx

- [x] **Step 7: Implement the primitives with `createPortal`, `useId`, the hook, current Button styles, dynamic viewport sizing, and safe-area padding**

- [x] **Step 8: Run every Task 1 test and verify GREEN without console warnings**

- [x] **Step 9: Commit**

  git add src/components/ui/overlay src/components/ui/Dialog.tsx src/components/ui/Dialog.test.tsx src/components/ui/AlertDialog.tsx src/components/ui/AlertDialog.test.tsx src/components/ui/Drawer.tsx src/components/ui/Drawer.test.tsx
  git commit -m "feat: add accessible overlay primitives"

### Task 2: Safe destructive confirmation

**Files:**

- Modify: `src/components/ui/ConfirmationModal.test.tsx`
- Modify: `src/components/ui/ConfirmationModal.tsx`

**Interfaces:** Keeps `ConfirmationModalProps` compatible and consumes `AlertDialog`.

- [x] **Step 1: Add failing bypass tests**

  it('does not confirm with Enter until verification matches', () => {
  const onConfirm = vi.fn();
  render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} verificationText="DELETE" />);
  fireEvent.keyDown(document, { key: 'Enter' });
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
  fireEvent.keyDown(document, { key: 'Enter' });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  });

Add separate loading, composing, textarea, select, contenteditable, reopen-reset, and focus-restoration cases.

- [x] **Step 2: Run `pnpm test src/components/ui/ConfirmationModal.test.tsx` and verify the unmatched Enter case fails because confirmation fires**

- [x] **Step 3: Implement one predicate and migrate presentation to `AlertDialog`**

  const canConfirm = !isLoading && (!verificationText || inputValue === verificationText);

Use this for both keyboard and button paths. Ignore composing and multiline/select/contenteditable targets. Reset input after close or required-text change. Delete local overlay behavior.

- [x] **Step 4: Run confirmation and Task 1 tests; verify GREEN**

- [x] **Step 5: Commit**

  git add src/components/ui/ConfirmationModal.tsx src/components/ui/ConfirmationModal.test.tsx
  git commit -m "fix: prevent destructive confirmation bypass"

### Task 3: Shared operation log foundation

**Files:**

- Create: `src/components/operations/operation-status.ts` and test
- Create: `src/components/operations/useOperationLogControls.ts` and test
- Create: `src/components/operations/OperationLogViewer.tsx` and test
- Create: `src/components/operations/OperationLogDialog.tsx` and test
- Modify: `src/components/ui/AutoscrollButton.tsx` and test

**Interfaces:** Produces the domain-neutral `OperationStatus`, status presentation, control hook, viewer, and dialog defined in the spec.

- [x] **Step 1: Write failing status and control-state tests**

  expect(getOperationStatusPresentation('running')).toMatchObject({
  label: 'Running', live: true, variant: 'warning',
  });
  expect(getOperationStatusPresentation('failed')).toMatchObject({
  label: 'Failed', live: false, variant: 'destructive',
  });

Render operation `op-1`, disable autoscroll, rerender with `op-1` and require it to stay off; rerender with `op-2` and require defaults.

- [x] **Step 2: Run the two tests and verify RED**

  pnpm test src/components/operations/operation-status.test.ts src/components/operations/useOperationLogControls.test.tsx

- [x] **Step 3: Implement mappings and operation-scoped controls; verify GREEN**

- [x] **Step 4: Write failing viewer tests**

Cover live-only Follow/Autoscroll controls, independent pressed states, sentinel scrolling only when enabled and live, wrapping, exact clipboard text, exact Blob download content/name, error role, waiting/empty text, full-screen callback, and a labeled non-chatty live log region.

- [x] **Step 5: Run `pnpm test src/components/operations/OperationLogViewer.test.tsx` and verify RED**

- [x] **Step 6: Implement the viewer**

Normalize arrays with `join('\n')`; use the same raw string for rendering, copy, and download. Use existing Button/Lucide styling and 44-pixel controls.

- [x] **Step 7: Write failing dialog tests for full-screen semantics, subtitle, status, operation ID, controls, close, and focus restoration**

- [x] **Step 8: Implement `OperationLogDialog` from `Dialog`, the status mapping, and viewer; verify all Task 3 tests GREEN**

- [x] **Step 9: Raise `AutoscrollButton` to a 44-pixel target while preserving its compatibility API and tests**

- [x] **Step 10: Commit**

  git add src/components/operations src/components/ui/AutoscrollButton.tsx src/components/ui/AutoscrollButton.test.tsx
  git commit -m "feat: add shared operation log experience"

### Task 4: Migrate Apps logs

**Files:**

- Modify: `src/modules/apps/ui/components/AppsOperationLogsDialog.tsx` and test
- Modify: `src/modules/apps/ui/AppsPage.tsx` and test
- Modify: `src/modules/apps/ui/AppsRuntimeLogsDialog.tsx` and test

**Interfaces:** Consumes Task 3 components without changing Apps APIs, operation ID reconciliation, or domain types.

- [x] **Step 1: Change tests to require synchronized independent Follow/Autoscroll controls in inline and full-screen running output, hidden live controls for terminal output, and focus behavior for runtime logs**

- [x] **Step 2: Run the three Apps tests and verify RED**

  pnpm test src/modules/apps/ui/components/AppsOperationLogsDialog.test.tsx src/modules/apps/ui/AppsRuntimeLogsDialog.test.tsx src/modules/apps/ui/AppsPage.test.tsx

- [x] **Step 3: Map Apps states to shared statuses and replace local dialog focus/scroll code with `OperationLogDialog`**

- [x] **Step 4: Replace inline output and duplicate checkboxes with `OperationLogViewer` plus operation-scoped controls, preserving current polling and full-screen launch**

- [x] **Step 5: Rebuild runtime logs on `Dialog`; keep priority/time/PID metadata and static log semantics**

- [x] **Step 6: Run all three Apps tests; verify GREEN**

- [x] **Step 7: Commit**

  git add src/modules/apps/ui
  git commit -m "refactor: unify app operation logs"

### Task 5: Migrate Updates and Cron output

**Files:**

- Modify: `src/modules/updates/ui/UpdatePage.tsx` and test
- Modify: `src/modules/crons/ui/components/RunOutputModal.tsx`
- Modify: `src/modules/crons/ui/CronsPage.test.tsx`

**Interfaces:** Preserves current API/state types and consumes Task 3 components.

- [x] **Step 1: Add failing Updates cases for Follow, Autoscroll, Wrap, full-screen, terminal-state control hiding, and disabled duplicate submission**

- [x] **Step 2: Run UpdatePage test and verify RED**

  pnpm test src/modules/updates/ui/UpdatePage.test.tsx

- [x] **Step 3: Replace the raw update `<pre>` and icon-only autoscroll with viewer; add active/history log dialog; verify GREEN**

- [x] **Step 4: Add failing Cron cases for dialog semantics, running controls, command metadata, Run in Background, and static completed output**

- [x] **Step 5: Run Cron test and verify RED**

  pnpm test src/modules/crons/ui/CronsPage.test.tsx

- [x] **Step 6: Rebuild `RunOutputModal` on `OperationLogDialog`; remove obsolete caller-owned scroll ref if no longer observed; verify GREEN**

- [x] **Step 7: Commit**

  git add src/modules/updates/ui src/modules/crons/ui
  git commit -m "refactor: unify update and cron operation logs"

### Task 6: Migrate AI Runner drawer

**Files:**

- Modify: `src/modules/ai-runner/ui/components/RunDetailDrawer.tsx` and test

**Interfaces:** Consumes `Drawer`, viewer, and controls while preserving sections and actions.

- [x] **Step 1: Add failing role/name, initial focus, Tab trap, Escape, restoration, live-only control, and operation-reset tests**

- [x] **Step 2: Run the drawer test and verify RED**

  pnpm test src/modules/ai-runner/ui/components/RunDetailDrawer.test.tsx

- [x] **Step 3: Replace the shell with right-side `Drawer`; map run state; replace only active output with viewer; keep command/metadata preformatted blocks**

- [x] **Step 4: Run test; verify GREEN**

- [x] **Step 5: Commit**

  git add src/modules/ai-runner/ui/components/RunDetailDrawer.tsx src/modules/ai-runner/ui/components/RunDetailDrawer.test.tsx
  git commit -m "refactor: make AI run details accessible"

### Task 7: Migrate remaining long-running output

**Files:**

- Create: `src/modules/self-service/ui/components/InstallProgress.test.tsx`
- Modify: `src/modules/self-service/ui/components/InstallProgress.tsx`
- Modify: `src/modules/fleet/ui/details/NodeStatusPanel.tsx` and test
- Modify: `src/modules/fleet/ui/details/NodeServerMonPanel.tsx` and test
- Modify: `src/modules/endpoints/ui/components/EndpointTestConsole.tsx`
- Modify: `src/modules/endpoints/ui/EndpointsPage.test.tsx`
- Modify: `src/modules/services/ui/components/ServiceLogPanel.tsx` and test

**Interfaces:** Retains domain timelines and metadata; standardizes only output controls/presentation.

- [x] **Step 1: Add self-service fixtures for running/failed/success jobs; require running-step live controls, static completed output, and preserved rollback/done actions**

- [x] **Step 2: Run new test and verify RED**

  pnpm test src/modules/self-service/ui/components/InstallProgress.test.tsx

- [x] **Step 3: Migrate expanded step logs; remove unconditional smooth scrolling; verify GREEN**

- [x] **Step 4: Extend Fleet tests to require shared status, Wrap, Autoscroll state, and no scrolling after disabling; run both tests and verify RED**

  pnpm test src/modules/fleet/ui/details/NodeStatusPanel.test.tsx src/modules/fleet/ui/details/NodeServerMonPanel.test.tsx

- [x] **Step 5: Replace Fleet duplicate log refs/effects/buttons with viewer; preserve polling and actions; verify GREEN**

- [x] **Step 6: Add a failing endpoint test for labeled copyable/wrappable command output; replace only execution output, leaving structured request/response panels intact**

- [x] **Step 7: Extend ServiceLogPanel tests for common controls, retry error, and preserved priority/time metadata; migrate presentation and verify GREEN**

- [x] **Step 8: Run every Task 7 test together**

  pnpm test src/modules/self-service/ui/components/InstallProgress.test.tsx src/modules/fleet/ui/details/NodeStatusPanel.test.tsx src/modules/fleet/ui/details/NodeServerMonPanel.test.tsx src/modules/services/ui/components/ServiceLogPanel.test.tsx src/modules/endpoints/ui/EndpointsPage.test.tsx

- [x] **Step 9: Commit**

  git add src/modules/self-service/ui/components src/modules/fleet/ui/details src/modules/endpoints/ui/components src/modules/services/ui/components
  git commit -m "refactor: standardize long-running operation output"

### Task 8: Restore zoom and reduced motion

**Files:**

- Create: `src/components/providers/MotionPreferencesProvider.tsx` and test
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: remaining infinite Framer loops needing an explicit stable reduced-motion branch, including HealthWidget

**Interfaces:** Provides one root Framer Motion preference boundary.

- [x] **Step 1: Write failing provider test requiring `MotionConfig reducedMotion="user"` and rendered children**

- [x] **Step 2: Run provider test and verify RED**

  pnpm test src/components/providers/MotionPreferencesProvider.test.tsx

- [x] **Step 3: Implement provider and add it once to root composition**

  'use client';
  export function MotionPreferencesProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
  }

- [x] **Step 4: Remove only `maximumScale: 1` from viewport metadata**

- [x] **Step 5: Add global reduced-motion CSS that stops decorative infinite motion and smooth scrolling without hiding content or focus**

- [x] **Step 6: Use `useReducedMotion()` for remaining explicit infinite Framer loops; render stable final states**

- [x] **Step 7: Run provider and affected component tests plus touched-file Prettier**

- [x] **Step 8: Commit**

  git add src/app/layout.tsx src/app/globals.css src/components/providers src/modules/health/ui
  git commit -m "feat: respect zoom and reduced motion preferences"

### Task 9: Shared polling registry

**Files:**

- Create: `src/lib/polling/useSharedPollingQuery.ts`
- Create: `src/lib/polling/useSharedPollingQuery.test.tsx`

**Interfaces:** Implements the exact generic option/result types from the spec. No production test-reset method.

- [x] **Step 1: Write failing same-key deduplication test using a test-local deferred promise and two real hook harnesses**

  expect(fetcher).toHaveBeenCalledTimes(1);
  request.resolve({ value: 7 });
  expect(await screen.findByTestId('a')).toHaveTextContent('7');
  expect(screen.getByTestId('b')).toHaveTextContent('7');

- [x] **Step 2: Run hook test and verify RED**

  pnpm test src/lib/polling/useSharedPollingQuery.test.tsx

- [x] **Step 3: Implement immutable external-store snapshots, one registry entry/request per key, and reference-counted subscribers; verify first case GREEN**

- [x] **Step 4: Add and observe RED one at a time for no overlap, final-unsubscribe abort, hidden pause/visible stale refresh, offline pause/online refresh, capped exponential backoff, success reset, AbortError suppression, manual-refresh deduplication, and idle cleanup**

- [x] **Step 5: Implement each lifecycle behavior minimally and verify GREEN after each**

- [x] **Step 6: Mutation review: removing each pause, abort, overlap, backoff-reset, or stable-snapshot guard must be caught by a test**

- [x] **Step 7: Commit**

  git add src/lib/polling/useSharedPollingQuery.ts src/lib/polling/useSharedPollingQuery.test.tsx
  git commit -m "feat: add shared visibility-aware polling"

### Task 10: Remove duplicate metrics streams and migrate compatible pollers

**Files:**

- Modify: `src/lib/MetricsContext.tsx` and test
- Modify: CPU/Memory chart widgets and tests
- Modify: HealthWidget and test
- Modify: `src/app/dashboard/page.tsx` and test
- Modify: `src/app/memory/page.tsx` and test
- Modify: `src/app/disk/page.tsx` and test
- Modify compatible page/widget pollers and tests for Ports, Certificates, Firewall, Nginx, Hardware, and Security
- Modify finite-operation pollers for self-service installation and service logs where interval polling fits

**Interfaces:** Metrics widgets consume `useMetrics()` when no explicit prop is supplied. Compatible consumers use shared polling keys with every relevant query parameter.

- [x] **Step 1: Add failing integration test rendering MetricsProvider with CPU, Memory, and Health consumers; require one EventSource and one message updating all consumers**

- [x] **Step 2: Run four metrics tests and verify RED due to direct widget EventSources**

  pnpm test src/lib/MetricsContext.test.tsx src/modules/metrics/ui/CPUChartWidget.test.tsx src/modules/metrics/ui/MemoryChartWidget.test.tsx src/modules/health/ui/HealthWidget.test.tsx

- [x] **Step 3: Migrate widgets to `externalData ?? context.history` and `metric ?? context.latest`; retain validation/clamping; verify GREEN**

- [x] **Step 4: Inventory each simple pair's endpoint, parameters, transform, and interval; use distinct keys where response shape differs**

- [x] **Step 5: Extend the shared polling and compatible consumer tests to prove that same-key subscribers reuse one request before migrating local intervals**

- [x] **Step 6: Migrate compatible loops to keys such as `ports:list`, `certificates:list`, `firewall:rules`, `nginx:hosts`, `hardware:snapshot`, and `security:checks`; retain domain-local state machines for Apps, Databases, and Services where optimistic mutation or operation reconciliation makes generic polling unsafe**

- [x] **Step 7: Migrate compatible finite-operation pollers with immutable ID keys, disable after terminal status while retaining final data, and leave specialized stream/state-machine consumers domain-local**

- [x] **Step 8: Run every touched feature test explicitly, inspect staged diff, and exclude unrelated files**

- [x] **Step 9: Commit**

  git add src/lib/MetricsContext.tsx src/lib/MetricsContext.test.tsx src/modules src/components
  git commit -m "perf: consolidate client metrics and polling"

### Task 11: Browser accessibility validation

**Files:** No source files are required; validate the running application with the existing Chromium smoke spec and an authenticated Playwright CLI session.

**Interfaces:** Verifies user-visible behavior through the running application without adding brittle environment-specific fixtures.

- [x] **Step 1: Locate and run the existing Chromium smoke spec; record environment blockers exactly**

- [x] **Step 2: Validate confirmation flow: the safe action receives initial focus; Enter cannot bypass destructive verification; exact-match behavior remains covered by unit tests**

- [x] **Step 3: Validate overlay flow: focus enters, Tab stays inside, Escape closes, trigger regains focus**

- [x] **Step 4: Validate Apps flow: active actions are disabled, live Follow/Autoscroll/Wrap/full-screen controls appear, historical output hides live controls, and closing restores focus without canceling**

- [x] **Step 5: Run at a narrow mobile viewport and with reduced motion; assert controls remain visible, zoom is not blocked, and the document has no horizontal overflow**

- [x] **Step 6: Run targeted Chromium tests and verify GREEN**

  pnpm exec playwright test e2e/apps.spec.ts --project=chromium

- [x] **Step 7: Confirm validation did not create or modify browser-test source files or retain authentication artifacts**

### Task 12: Full verification and documentation sync

**Files:**

- Modify: this plan to check completed tasks
- Modify: `docs/CODEBASE_IMPROVEMENT_AUDIT_2026-08-20.md` to record completed UI findings and actual verification results

**Interfaces:** None.

- [x] **Step 1: Run Prettier on all changed TS/TSX/CSS/MD files and `git diff --check`**

- [x] **Step 2: Run every new test plus directly modified feature tests; require zero failures and investigate new warnings**

- [x] **Step 3: Run full unit/integration suite**

  pnpm test

Expected: the original 621 files / 5,056 tests plus new tests, all passing. Actual: 633 files / 5,087 tests passed.

- [x] **Step 4: Run static/build checks**

  pnpm typecheck
  pnpm lint
  pnpm build
  pnpm check:release-contract

Compare against the audit baseline of 45 type errors and 7 lint warnings. Introduce zero new issues and fix every touched-file issue.

- [x] **Step 5: Run targeted Chromium tests; if environment blocks them, report the exact command and error without claiming success**

- [x] **Step 6: Inspect complete diff/status for generated artifacts, secrets, unrelated changes, and accidental unrelated-file inclusion**

- [x] **Step 7: Check completed plan items and record actual verification results**

- [x] **Step 8: Commit final plan/documentation update**

  git add docs/CODEBASE_IMPROVEMENT_AUDIT_2026-08-20.md docs/superpowers/plans/2026-08-20-accessible-operations-ui.md
  git commit -m "docs: record accessible operations UI rollout"

## Execution checkpoints

- **Checkpoint A:** Tasks 1–3 — primitives and safety contracts.
- **Checkpoint B:** Tasks 4–7 — feature migrations.
- **Checkpoint C:** Tasks 8–10 — preferences and polling.
- **Checkpoint D:** Tasks 11–12 — browser/full verification and documentation.

At each checkpoint, inspect the actual diff and run the full targeted tests before continuing.
