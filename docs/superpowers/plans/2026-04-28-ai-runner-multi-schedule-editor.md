# AI Runner Multi Schedule Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Multi Schedule Editor for existing AI Runner schedules with bulk server validation/save and CSV paste import.

**Architecture:** Add a dedicated `bulk-update` API route backed by an `AIRunnerService.bulkUpdateSchedules()` method that validates all changed rows before mutating any schedule. Add a focused React modal component for table editing, CSV parsing, local validation, and row-level error display, then wire it into `AIRunnerPage`.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Zod, Mongoose models, React, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Backend Bulk Update Contract

**Files:**

- Modify: `src/lib/ai-runner/schemas.ts`
- Modify: `src/lib/ai-runner/service.ts`
- Test: `src/lib/ai-runner/service.test.ts`
- Create: `src/app/api/modules/ai-runner/schedules/bulk-update/route.ts`
- Test: `src/app/api/modules/ai-runner/schedules/bulk-update/route.test.ts`

- [x] Write failing service tests for successful multi-row update and invalid cron pre-save rejection.
- [x] Run `pnpm vitest run src/lib/ai-runner/service.test.ts` and confirm the new tests fail because `bulkUpdateSchedules` is missing.
- [x] Add `scheduleBulkUpdateSchema`, row error types, and `AIRunnerService.bulkUpdateSchedules()`.
- [x] Add the API route and route tests for auth, success, and validation errors.
- [x] Run `pnpm vitest run src/lib/ai-runner/service.test.ts src/app/api/modules/ai-runner/schedules/bulk-update/route.test.ts`.

### Task 2: Multi Schedule Editor Modal

**Files:**

- Create: `src/modules/ai-runner/ui/components/MultiScheduleEditorModal.tsx`
- Test: `src/modules/ai-runner/ui/AIRunnerPage.test.tsx`
- Modify: `src/modules/ai-runner/ui/AIRunnerPage.tsx`

- [x] Write failing UI tests that open the modal, edit a row, save through `/bulk-update`, and import CSV by name.
- [x] Run `pnpm vitest run src/modules/ai-runner/ui/AIRunnerPage.test.tsx` and confirm the new tests fail because the modal does not exist.
- [x] Implement the modal with editable `cronExpression`, `timeout`, and `retries` fields, local validation, CSV paste import, dirty tracking, and row errors.
- [x] Wire `Multi Schedule Editor` into the schedules tab and refresh schedules after success.
- [x] Run `pnpm vitest run src/modules/ai-runner/ui/AIRunnerPage.test.tsx`.

### Task 3: Final Verification and Git

**Files:**

- Review all changed files with `git diff`.

- [x] Run `pnpm format:check`.
- [x] Run `pnpm check`.
- [x] Fix any failures and rerun the failed command.
- [ ] Commit the implementation.
- [ ] Push `main` to origin.
