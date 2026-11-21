# Apps V2 Worker Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Apps deploy/update/rollback/delete API requests from request-owned host execution to durable Mongo-backed operation records that a dedicated worker can claim and execute.

**Architecture:** This is the first executable slice of the full Apps v2 design. It adds durable operation, event, and heartbeat collections; pure operation transition rules; enqueue and repository services; async API routes; a single-slot worker loop; and compatibility wrappers for existing mutating routes. The worker initially executes through existing Apps service functions as a migration bridge; the later checkpointed pipeline extraction replaces that bridge after queue ownership is proven.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Mongoose, MongoDB, Vitest, `tsx`, existing Apps service/deploy helpers.

---

## Scope Boundary

Included:

- Add `AppOperation`, `AppOperationEvent`, `AppRelease`, and `AppsWorkerHeartbeat` models.
- Add additive v2 fields to `ManagedApp` while keeping embedded legacy releases and operations.
- Add operation state rules, redaction, queue configuration, operation/event/heartbeat repositories, and enqueue service.
- Add async operation routes plus compatibility wrappers for deploy, update, rollback, and delete.
- Add worker runner, temporary legacy executor bridge, process entry point, package script, and service unit.
- Add minimal UI parser/loading changes for accepted operation responses.

Deferred:

- Full checkpointed deployment pipeline.
- History migration.
- Auto-update worker cutover.
- SSE long-polling stream beyond bounded event retrieval if not needed for this slice.

## Task Checklist

- [ ] Domain rules: add failing tests for active/terminal statuses and transition immutability, then implement `src/lib/apps/domain/operation-state.ts` and v2 types in `src/modules/apps/types.ts`.
- [ ] Schemas: add failing schema/index tests, then implement new models and additive `ManagedApp` fields.
- [ ] Events: add redaction and ordered event repository tests, then implement redaction and append/list helpers.
- [ ] Queue repository: add enqueue/idempotency/active-lock/claim/lease/terminal tests, then implement atomic repository methods.
- [ ] Enqueue service: add app validation/snapshot/conflict tests, then implement `enqueueAppOperation`.
- [ ] API routes: add auth/payload/accepted/detail/events tests, then implement new operation endpoints.
- [ ] Compatibility routes: update route tests to expect `202`, then switch deploy/update/rollback/delete to enqueue.
- [ ] Worker: add runner tests with fake repository and executor, then implement runner, heartbeat repository, legacy executor, and `src/workers/apps-worker.ts`.
- [ ] Release contract: update `package.json`, add `scripts/servermon-apps-worker.service`, and extend `scripts/check-release-contract.ts`.
- [ ] UI: add accepted-operation parser/loading tests, then update `appPayload.ts` and the smallest safe part of `AppsPage.tsx`.
- [ ] Verification: run focused Apps/model/API/UI tests, `pnpm format:check`, `pnpm check:release-contract`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test`.

## Design Review Notes

- The temporary legacy executor removes request-owned work but does not provide checkpoint recovery. It must be replaced by the checkpointed pipeline slice.
- Returning `202` from compatibility routes is an intentional behavior change required by the design doc.
- Keep legacy embedded operation and release fields until migration and rollback windows are complete.
- Do not move auto-update into the worker in this slice.
