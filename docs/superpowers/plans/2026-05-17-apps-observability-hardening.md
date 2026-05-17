# Apps Observability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Apps module observable and operationally transparent for deploys, updates, rollbacks, logs, and runtime resource usage.

**Architecture:** Extend the existing ManagedApp model with bounded operation history, add app-specific runtime/log/rollback service helpers, and surface those fields through the existing Apps API and page. Keep the current synchronous action endpoints, but persist progress logs throughout each action so users can see what happened even after refresh.

**Tech Stack:** Next.js App Router, TypeScript, Mongoose, Zod, Vitest, React Testing Library, systemd, journalctl.

---

### Task 1: Operation And Runtime Types

**Files:**

- Modify: `src/modules/apps/types.ts`
- Modify: `src/models/ManagedApp.ts`
- Modify: `src/lib/apps/service.ts`
- Test: `src/lib/apps/service.test.ts`

- [ ] Write failing tests that expect `mapManagedAppToDTO()` to expose `operations` and `runtime`.
- [ ] Add `AppOperation`, `AppRuntimeSnapshot`, and rollback result types.
- [ ] Add an `operations` subdocument schema with id, type, status, title, step, timestamps, logs, error, releaseId, and commitSha.
- [ ] Map persisted operations into DTOs and default missing arrays to `[]`.
- [ ] Run `pnpm test src/lib/apps/service.test.ts`.

### Task 2: Runtime And Logs APIs

**Files:**

- Create: `src/lib/apps/runtime.ts`
- Create: `src/app/api/modules/apps/[id]/logs/route.ts`
- Test: `src/lib/apps/runtime.test.ts`
- Test: `src/app/api/modules/apps/[id]/logs/route.test.ts`

- [ ] Write failing tests for systemd show parsing and journal log parsing.
- [ ] Implement `getManagedAppRuntime()` with `systemctl show` and best-effort unavailable handling.
- [ ] Implement `getManagedAppLogs()` with bounded `journalctl -u servermon-app-<slug>.service`.
- [ ] Add admin-only logs route that looks up the app and returns `{ logs }`.
- [ ] Run focused runtime and route tests.

### Task 3: Progress Recording For Deploy And Update

**Files:**

- Modify: `src/lib/apps/deploy.ts`
- Modify: `src/lib/apps/git.ts`
- Modify: `src/lib/apps/service.ts`
- Test: `src/lib/apps/deploy.test.ts`
- Test: `src/lib/apps/service.update.test.ts`

- [ ] Write failing tests that deploy/update create running operations and complete them with logs.
- [ ] Add optional progress callbacks to deployment and git preparation helpers.
- [ ] Append operation logs after each major step and command output.
- [ ] Complete operations as succeeded, failed, or unchanged.
- [ ] Run focused deploy/update tests.

### Task 4: Rollback

**Files:**

- Modify: `src/lib/apps/service.ts`
- Create: `src/app/api/modules/apps/[id]/rollback/route.ts`
- Test: `src/lib/apps/service.update.test.ts`
- Test: `src/app/api/modules/apps/[id]/rollback/route.test.ts`

- [ ] Write failing tests for valid rollback, missing release, and failed health check.
- [ ] Implement `rollbackManagedApp(appId, releaseId)` using managed release paths, systemd restart, and health check.
- [ ] Add admin-only rollback route accepting `{ releaseId }`.
- [ ] Run focused rollback tests.

### Task 5: Apps Page Observability UI

**Files:**

- Modify: `src/modules/apps/ui/appPayload.ts`
- Modify: `src/modules/apps/ui/AppsPage.tsx`
- Test: `src/modules/apps/ui/AppsPage.test.tsx`

- [ ] Write failing tests for runtime cards, operation logs, logs modal, and rollback button.
- [ ] Parse operation and runtime DTO fields defensively.
- [ ] Render active operation summary and expanded runtime/operations panels.
- [ ] Add logs viewer and rollback action controls with loading/error feedback.
- [ ] Run `pnpm test src/modules/apps/ui/AppsPage.test.tsx`.

### Task 6: Verification And Git

**Files:**

- Modify: `CLAUDE.md` if new permanent files need workspace-index entries.

- [ ] Run `pnpm format:check`.
- [ ] Run `pnpm check`.
- [ ] Inspect `git diff` and `git status`.
- [ ] Commit with a high-signal message.
- [ ] Push `main` to origin.
