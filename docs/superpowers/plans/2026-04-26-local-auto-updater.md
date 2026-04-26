# Local Auto-Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local daily ServerMon auto-updater with optional colocated agent update, detached via `systemd-run`.

**Architecture:** Add a focused `src/lib/updates/auto-update.ts` service for settings, due-time math, upstream checks, and launch orchestration. Extend `system-service` with reusable update script construction and detached auto-run support. Add authenticated API routes and update the Settings card with the scheduler-first UI.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Vitest, React, existing UI components, `systemd-run`, local JSON config.

---

### Task 1: Auto-Update Service Core

**Files:**

- Create: `src/lib/updates/auto-update.ts`
- Test: `src/lib/updates/auto-update.test.ts`

- [ ] Write tests for default settings, save/load with config path override, timezone daily due calculation, 2-hour missed-run catch-up, one retry per day, active-run duplicate prevention, and upstream check outcomes.
- [ ] Implement pure types and helpers: `getDefaultAutoUpdateSettings`, `loadAutoUpdateSettings`, `saveAutoUpdateSettings`, `getAutoUpdateScheduleState`, `shouldLaunchAutoUpdate`, and `checkRepoForUpdates`.
- [ ] Run `pnpm test src/lib/updates/auto-update.test.ts`.

### Task 2: Detached Auto-Update Runner

**Files:**

- Modify: `src/lib/updates/system-service.ts`
- Test: `src/lib/updates/system-service.test.ts`
- Modify: `src/types/updates.ts`

- [ ] Add tests proving a detached auto-run includes ServerMon first, then agent, and stops before agent when ServerMon fails.
- [ ] Add `skipped` update status support.
- [ ] Expose reusable script builders and `triggerLocalAutoUpdateRun`.
- [ ] Ensure metadata/logs include auto-update phase labels and can represent skipped runs.
- [ ] Run `pnpm test src/lib/updates/system-service.test.ts`.

### Task 3: API Routes

**Files:**

- Create: `src/app/api/system/update/auto/route.ts`
- Test: `src/app/api/system/update/auto/route.test.ts`

- [ ] Write tests for unauthenticated rejection, GET settings/status, PATCH validation, and successful save.
- [ ] Implement authenticated GET/PATCH with Zod validation.
- [ ] Run `pnpm test src/app/api/system/update/auto/route.test.ts`.

### Task 4: Scheduler Startup Wiring

**Files:**

- Create: `src/lib/updates/auto-update-scheduler.ts`
- Test: `src/lib/updates/auto-update-scheduler.test.ts`
- Modify: `src/server.ts`

- [ ] Write tests proving the scheduler runs an immediate startup tick and does not create duplicate intervals.
- [ ] Implement `startLocalAutoUpdateScheduler`.
- [ ] Call it during normal ServerMon startup, not fleet-agent mode.
- [ ] Run `pnpm test src/lib/updates/auto-update-scheduler.test.ts`.

### Task 5: Settings UI

**Files:**

- Modify: `src/components/settings/ServerMonServicesCard.tsx`
- Test: `src/app/settings/page.test.tsx`

- [ ] Write UI tests for scheduler-first rendering, opening the compact schedule modal, saving time/timezone, disabled schedule state, and agent-present status.
- [ ] Implement the B-style card section and modal.
- [ ] Keep manual ServerMon and agent update actions working.
- [ ] Run `pnpm test src/app/settings/page.test.tsx`.

### Task 6: Verification and Publish

**Files:**

- All changed files.

- [ ] Run focused tests changed above.
- [ ] Run `pnpm check`.
- [ ] Run `git pull --rebase origin main`.
- [ ] Commit implementation.
- [ ] Push `main`.
