# Apps Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Linux-first Apps module that deploys pure Next.js apps from managed release copies with explicit user commands.

**Architecture:** Add a new `apps` module with typed templates, a Mongoose model for managed apps, pure deployment helpers for paths/config rendering, API routes for list/create/deploy, and a first UI that can create and deploy apps. Deployed apps run independently through systemd and Nginx so ServerMon remains the control plane rather than the runtime dependency.

**Tech Stack:** Next.js App Router, TypeScript, Mongoose, Zod, Vitest, systemd, Nginx, Linux shell commands.

---

### Task 1: Typed Template And Deployment Helpers

**Files:**

- Create: `src/modules/apps/types.ts`
- Create: `src/lib/apps/paths.ts`
- Create: `src/lib/apps/rendering.ts`
- Test: `src/lib/apps/rendering.test.ts`

- [ ] Write failing tests for slug validation, env masking, systemd rendering, Nginx rendering, DNS guidance, and release ids.
- [ ] Implement the helper functions with no shell side effects.
- [ ] Run `pnpm test src/lib/apps/rendering.test.ts`.

### Task 2: Persistence Model And Service

**Files:**

- Create: `src/models/ManagedApp.ts`
- Create: `src/lib/apps/service.ts`
- Test: `src/lib/apps/service.test.ts`

- [ ] Write failing tests for request validation and API-safe DTO masking.
- [ ] Implement app creation, list mapping, and release status updates.
- [ ] Run `pnpm test src/lib/apps/service.test.ts`.

### Task 3: Deployment Runner

**Files:**

- Create: `src/lib/apps/deploy.ts`
- Test: `src/lib/apps/deploy.test.ts`

- [ ] Write failing tests for command ordering and failure-before-cutover behavior using an injected command runner.
- [ ] Implement the release directory, copy, env write, install, build, systemd, health check, and Nginx steps.
- [ ] Keep Linux/systemd/Nginx commands isolated behind the injected runner.
- [ ] Run `pnpm test src/lib/apps/deploy.test.ts`.

### Task 4: API Routes

**Files:**

- Create: `src/app/api/modules/apps/route.ts`
- Create: `src/app/api/modules/apps/[id]/deploy/route.ts`
- Test: `src/app/api/modules/apps/route.test.ts`

- [ ] Write failing API tests for unauthorized access and invalid creation requests.
- [ ] Implement authenticated list/create/deploy routes with Zod validation.
- [ ] Run `pnpm test src/app/api/modules/apps/route.test.ts`.

### Task 5: UI And Module Registration

**Files:**

- Create: `src/modules/apps/module.ts`
- Create: `src/modules/apps/ui/AppsPage.tsx`
- Create: `src/modules/apps/ui/AppsWidget.tsx`
- Create: `src/app/apps/page.tsx`
- Modify: `src/components/modules/ModuleWidgetRegistry.tsx`
- Modify: `src/components/layout/navigation.ts`

- [ ] Add module registration and navigation.
- [ ] Build the Apps page with app list, create form, DNS guidance, masked env preview, and deploy logs.
- [ ] Add widget with count/status summary.
- [ ] Run focused UI/component tests if created, then `pnpm typecheck`.

### Task 6: Verification

**Files:**

- Modify: `CLAUDE.md`

- [ ] Update the workspace index with the new Apps module files.
- [ ] Run `pnpm format:check`.
- [ ] Run `pnpm check`.
- [ ] Fix any failures before reporting completion.
