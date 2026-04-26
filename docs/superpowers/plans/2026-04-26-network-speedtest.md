# Network Speedtest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual and scheduled internet speed tests to the Network module, backed by the installed `speedtest` CLI and persistent history.

**Architecture:** A focused network speedtest service detects Ookla vs Python `speedtest-cli`, runs one test at a time, normalizes output, persists results in MongoDB, and exposes manual/schedule controls through a dedicated API. A lightweight scheduler runs from `src/server.ts` and only launches due scheduled tests. The Network page shows the latest result, schedule controls, run status, and a history modal with charts.

**Tech Stack:** Next.js App Router API routes, TypeScript, Mongoose, Vitest, Recharts, existing ServerMon UI components.

---

### Task 1: Domain Types And Models

**Files:**

- Modify: `src/modules/network/types.ts`
- Create: `src/models/NetworkSpeedtestResult.ts`
- Create: `src/models/NetworkSpeedtestSettings.ts`

- [ ] Define `NetworkSpeedtestResult`, `NetworkSpeedtestSettings`, and `NetworkSpeedtestScheduleInterval` in the network module types.
- [ ] Add a result model with completed and failed run fields, indexed by `startedAt`.
- [ ] Add a singleton settings model with `scheduleInterval`, `nextRunAt`, and `lastScheduledRunAt`.

### Task 2: Service With TDD

**Files:**

- Create: `src/lib/network/speedtest.ts`
- Create: `src/lib/network/speedtest.test.ts`

- [ ] Write tests for Python `speedtest --json` parsing.
- [ ] Write tests for Ookla `speedtest --format=json --progress=no` parsing.
- [ ] Write tests for missing CLI failures being persisted.
- [ ] Write tests for schedule interval calculation and settings updates.
- [ ] Implement CLI detection, command execution, output normalization, persistence, history retrieval, and schedule helpers.

### Task 3: API Route With TDD

**Files:**

- Create: `src/app/api/modules/network/speedtest/route.ts`
- Create: `src/app/api/modules/network/speedtest/route.test.ts`

- [ ] Add `GET` for history/settings/status.
- [ ] Add `POST` for manual run.
- [ ] Add `PATCH` for schedule updates using fixed intervals: `off`, `30m`, `1h`, `3h`, `6h`, `24h`.
- [ ] Return clear JSON errors for invalid requests and running-test conflicts.

### Task 4: Scheduler

**Files:**

- Create: `src/lib/network/speedtest-scheduler.ts`
- Modify: `src/server.ts`

- [ ] Add a minute-based scheduler that checks persisted schedule settings.
- [ ] Start it during normal ServerMon server startup.
- [ ] Ensure scheduled runs use the same service and concurrency guard as manual runs.

### Task 5: Network UI

**Files:**

- Modify: `src/modules/network/ui/NetworkPage.tsx`
- Modify: `src/modules/network/ui/NetworkPage.test.tsx`

- [ ] Add a speedtest panel after the page header with latest download, upload, ping, server, ISP, result URL, status, manual run, schedule select, and history button.
- [ ] Add a history modal with a line chart for download/upload/ping and a compact result table.
- [ ] Preserve existing network polling behavior and terminal diagnostics.

### Task 6: Verification And Commit

**Files:**

- Modify: `CLAUDE.md`

- [ ] Update the workspace index for new speedtest files.
- [ ] Run targeted tests for the service, route, and Network page.
- [ ] Run required checks as far as practical.
- [ ] Commit only files changed for this feature and push `main`.
