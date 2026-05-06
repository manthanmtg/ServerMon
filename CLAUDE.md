# CLAUDE.md — Unified Project Guidelines for ServerMon

This file is the single source of truth for all project rules, coding conventions, and automated agent requirements.

## Mandatory Checks & Pre-merge Requirements

Every change (PR or commit to `main`) **must** satisfy these requirements:

| Check            | Command                       | Expectation          |
| ---------------- | ----------------------------- | -------------------- |
| Format           | `pnpm format:check`           | 0 changes needed     |
| Release contract | `pnpm check:release-contract` | Exit code 0          |
| Lint             | `pnpm lint`                   | 0 errors, 0 warnings |
| Types            | `pnpm typecheck`              | 0 errors             |
| Build            | `pnpm build`                  | Exit code 0          |
| Tests            | `pnpm test`                   | Exit code 0          |

Shortcut: `pnpm check` runs the release contract check, lint, typecheck, build, and tests in sequence; run `pnpm format:check` separately. **A failure in any required step blocks the merge.**

---

## Project Overview

ServerMon is a self-hosted server monitoring platform built with Next.js 16.1 (App Router), TypeScript, MongoDB, and Tailwind CSS 4.2. It follows a modular architecture where features (terminal, processes, logs, metrics) are independent modules that register into a core shell.

---

## Repository Health Rules

### No Ignored Errors

- Do not add `eslint-disable` comments without a paired explanation comment.
- Do not add `@ts-ignore` or `@ts-expect-error`. Fix the type issue instead.
- Do not add `any` types. Use `unknown` and narrow with type guards.

### No Dead Code

- Remove unused imports, variables, functions, and files.
- Do not comment out code and commit it. Use Git history instead.

### No Secrets

- Never commit `.env`, `.env.local`, credentials, API keys, or tokens.
- `.env.example` is the only env file that should be tracked.

### No Large Files

- `.pnpm-store/`, `node_modules/`, `.next/`, and build artifacts must never be committed.
- These are in `.gitignore`. If git tries to track them, something is wrong.

### Dependency Hygiene

- Use `pnpm` exclusively. Do not use npm or yarn.
- Do not add dependencies without a clear need.
- Pin major versions in `package.json`. Use `^` for minor/patch.

---

## File Conventions & Component Checklists

### Naming

| Type       | Convention                           | Example                          |
| ---------- | ------------------------------------ | -------------------------------- |
| Pages      | `page.tsx` in route folder           | `src/app/dashboard/page.tsx`     |
| API routes | `route.ts` in API folder             | `src/app/api/health/route.ts`    |
| Components | PascalCase `.tsx`                    | `ProShell.tsx`, `Button.tsx`     |
| Utilities  | camelCase `.ts`                      | `utils.ts`, `logger.ts`          |
| Types      | PascalCase interface, camelCase file | `module.ts` → `Module` interface |
| Modules    | lowercase folder name                | `src/modules/terminal/`          |

### New Component Checklist (`src/components/ui/`)

1. Use `forwardRef` for elements that accept refs.
2. Accept a `className` prop and merge with `cn()`.
3. Use semantic theme tokens — **never hardcode colors** (e.g. `bg-slate-900`).
4. Export the component and its props type.
5. Ensure minimum 44px touch target (`min-h-[44px]`).

### New Module Checklist (`src/modules/<name>/`)

1. Create `module.ts` with the `Module` interface.
2. Create UI in `ui/` subfolder.
3. Register the widget in `src/components/modules/ModuleWidgetRegistry.tsx`.
4. Add the nav entry in `src/components/layout/ProShell.tsx` `navGroups`.
5. Create the page route in `src/app/<name>/page.tsx` wrapped in `<ProShell>`.
6. Run `pnpm check` to verify.

### New API Route Checklist

1. Wrap handler body in try/catch.
2. Use `createLogger('api:<name>')`.
3. Return `{ error: "message" }` on failures with proper HTTP status.
4. Add `export const dynamic = 'force-dynamic'` if accessing DB or runtime state.
5. Validate input with Zod if accepting a request body.
6. **Security**: Ensure all routes require authentication via `getSession()`.

---

## Testing Guidelines

Tests use **Vitest** for unit/integration and **Playwright** for E2E.

- **Unit Tests**: Place tests next to the file: `file.test.ts` or `ui/Component.test.tsx`.
- **Mocking**: Use `vi.mock()` for dependency injection.
- **Coverage**: Aim for high coverage on core utility logic and API handlers.

---

## Security Rules

- **Default Authentication**: All routes are protected by default via `src/proxy.ts`.
- **WebSocket Security**: Connections **must** be authenticated using the session cookie.
- **Manual Verification**: Proactively verify session existence (`getSession()`) in sensitive API handlers.
- **Input Validation**: Always validate user input with Zod before processing.

---

## Architecture Decisions

- **Single SSE connection**: `MetricsProvider` creates one `EventSource`. Never create instances in widgets.
- **Global command search**: Accessible via shortcut for quick navigation across modules and actions.
- **CSS variable theming**: All colors flow through variables defined in `src/app/globals.css`.
- **Error boundaries**: `ModuleWidgetRegistry` wraps each widget automatically.
- **Structured logging**: Use `createLogger()` from `src/lib/logger.ts`. Never use `console.log`.
- **Runtime Diagnostics**: Centralized system health snapshots and request instrumentation via `src/lib/runtime-diagnostics.ts` and `src/lib/server-request-diagnostics.ts`.

---

## Environment Variables

Required at runtime (set in `.env.local` or `/etc/servermon/env`):

| Variable                       | Required | Description                                           |
| ------------------------------ | -------- | ----------------------------------------------------- |
| `MONGO_URI`                    | Yes      | MongoDB connection string                             |
| `JWT_SECRET`                   | Yes      | Secret for signing session JWTs                       |
| `PORT`                         | No       | App port (default: 8912)                              |
| `NODE_ENV`                     | No       | `development` or `production`                         |
| `LOG_LEVEL`                    | No       | `debug`, `info`, `warn`, `error`                      |
| `SERVERMON_SLOW_REQUEST_MS`    | No       | Threshold for slow request logging (default: 2000)    |
| `SERVERMON_REPO_DIR`           | No       | Path to ServerMon repo (default: /opt/servermon/repo) |
| `SERVERMON_NETWORK_MOCK`       | No       | Set to `1` to mock network speedtests                 |
| `SERVERMON_DOCKER_MOCK`        | No       | Set to `1` to mock Docker operations                  |
| `SERVERMON_UPDATES_MOCK`       | No       | Set to `1` to mock system updates                     |
| `SERVERMON_AUTO_UPDATE_CONFIG` | No       | Path to auto-update config JSON                       |
| `FLEET_HUB_PUBLIC_URL`         | No       | Public URL for the Fleet Hub                          |
| `AI_RUNNER_MAX_WORKERS`        | No       | Max concurrent AI Runner workers                      |
| `SERVERMON_INSTALL_MODE`       | No       | `hub` or `agent` installation mode                    |

---

## Commit Standards

- Run `pnpm check` before committing.
- Write imperative commit messages: "Add health endpoint" not "Added health endpoint".
- Group related changes in one commit.

---

# Workspace Index

Concise map of major directories, commands, and key files. Update this section whenever files/directories are added or removed.

## Core Commands

- `pnpm dev` — run dev server via `src/server.ts`
- `pnpm build` — Next.js production build (`NODE_OPTIONS` enabled)
- `pnpm start` — run production server
- `pnpm lint` — ESLint over `src/`
- `pnpm typecheck` — `tsc --noEmit` (`NODE_OPTIONS` enabled)
- `pnpm check:release-contract` — validate required release artifact contracts
- `pnpm release` — create and tag a new SemVer release (patch, minor, major)
- `pnpm test` — Vitest unit/integration
- `pnpm test:e2e` — Playwright end-to-end
- `pnpm format` — Prettier write
- `pnpm format:check` — Prettier check
- `pnpm check` — release contract + lint + typecheck + build + test

## Top-level Layout

- `src/` — application source (see sub-index below)
- `e2e/` — Playwright end-to-end specs
- `scripts/` — CLI helper scripts (installers, updates, macOS launchd, releases)
- `public/` — static assets
- `docs/` — plans and reference docs (superpowers plans live under `docs/superpowers/plans/`)
- `module_ideas/` — product specs per module (e.g. `fleet_management.md`)
- `prompts/`, `manual_prompts/`, `issues_to_look/` — autonomous run prompts, prompt observability metadata (`prompts/prompts_metadata.json`), manual prompts, and investigation notes
- `.env.example` — required runtime env vars (do NOT commit real `.env`)
- `CLAUDE.md`, `README.md`, `PRD.md`, `DEPLOY.md`, `AGENTS.md`, `GO_LIVE.md` — project docs
- `Release Artifacts` — prebuilt hub and agent tarballs (see `DEPLOY.md`)

## `src/` Layout

- `src/app/` — Next.js App Router pages + `api/` route handlers (dashboard, settings, fleet, ai-runner, crons, self-service, endpoints, security, certificates, ports, memory, guide, etc.)
- `src/app/api/modules/` — feature-specific API routes (ai-runner, disk, nginx, users, services, processes, terminal, security, etc.)
- `src/app/api/analytics/` — internal usage analytics and recent event history
- `src/components/` — shared UI (including `layout/`, `ui/`, `modules/`)
- `src/lib/` — utilities, domain logic, fleet libraries, AI orchestration, and core context providers (`ThemeContext.tsx`, `BrandContext.tsx`, `MetricsContext.tsx`)
- `src/lib/runtime-diagnostics.ts`, `src/lib/server-request-diagnostics.ts` — system health snapshots and Next.js request instrumentation
- `src/lib/runtime-launch-context.ts` — platform and environment detection during server startup
- `src/lib/fetch-utils.ts` — resilient server/client fetch helpers for request timeouts, retries, and safe JSON parsing
- `src/lib/crons/service.ts` — internal job scheduling and management
- `src/lib/ai-agents/` — agent adapters (Claude Code, Codex, Gemini CLI) and session monitoring
- `src/lib/ai-runner/` — automated task supervisor, watchdog, and worker orchestration
- `src/lib/ai-runner/run-as-user.ts` — Run as user isolation and sudo-based execution logic
- `src/lib/ai-runner/shared.ts` — profile mapping, template validation, and output buffering
- `src/lib/endpoints/` — executors for custom API logic (scripts, webhooks, logic handlers)
- `src/lib/certificates/`, `src/lib/ports/`, `src/lib/memory/`, `src/lib/security/` — service-layer logic for certificates, ports, memory monitoring, and security management
- `src/models/` — Mongoose schemas
- `src/modules/` — feature modules (terminal, processes, logs, metrics, fleet, ai-agents, ai-runner, apps, disk, nginx, self-service, endpoints, users, services, security, certificates, ports, memory, guide, etc.)
- `src/models/NetworkSpeedtestResult.ts`, `src/models/NetworkSpeedtestSettings.ts`, `src/models/NetworkAlert.ts`, `src/models/NetworkStatAggregate.ts` — persisted Network module data
- `src/models/CustomEndpoint.ts`, `src/models/EndpointExecutionLog.ts` — persisted endpoint configuration and execution history
- `src/lib/env-vars/` — stateless host environment variable helpers for OS target detection, shell env parsing, user-scope add/delete, and system-scope instructions
- `src/lib/network/speedtest.ts`, `src/lib/network/speedtest-scheduler.ts` — speedtest CLI normalization, history persistence, fixed-interval scheduling, and startup scheduler
- `src/server.ts` — custom Next.js server entry (Socket.IO bridge)
- `src/proxy.ts`, `src/proxy.test.ts` — reverse proxy helper + tests
- `src/test/` — shared test setup
- `src/types/` — ambient TypeScript types

### Fleet Management

- `src/models/` — fleet Mongoose models: Node, FrpServerState, FleetLogEvent, ConfigRevision, PublicRoute, NginxState, AgentUpdateJob, BackupJob, ResourcePolicy, AccessPolicy, RouteTemplate, DiagnosticRun, ImportedConfig, AlertChannel, AlertSubscription, FleetCommandSecret
- `src/lib/fleet/` — pure libraries: enums, status, pairing, toml, toml-parse, nginx, binary, frpProcess, nginxProcess, heartbeat, audit, revisions, templates, install-script, preflight, preflightExecutors, diagnostics, firewall, dns, acme, resourceGuards, resourceGuardMiddleware, access, rbac, import, backup, frpOrchestrator, nginxOrchestrator, applyEngine, orchestrators, reconcile, publicRouteLifecycle, publicRouteProxy, resolveAgentEndpoint, agentClient, agentPtyBridge, tty-bridge, hubAuth, hubTtyBridge, fleetTtyNamespace, eventBus, docsMarkdown, alerts, alertSubscriber, servermonStatus, servermonInstall, servermonAgentCommands, agentUpdateCommand, commandSecrets, domain
- `src/app/api/fleet/` — fleet HTTP routes: nodes (+ `[id]/diagnose`, `/heartbeat`, `/maintenance`, `/pair`, `/reconcile`, `/rotate-token`, `/servermon`, `/updates`), server, routes, nginx, templates, access-policies, resource-policies, logs, revisions (incl. `[id]/apply` + `[id]/rollback`), backups, emergency, install, import, endpoint-exec, public, stream, alerts/channels (+ `[id]`), alerts/subscriptions (+ `[id]`), alerts/test
- `src/app/fleet/` — fleet UI pages: dashboard, node detail `[slug]`, onboarding, setup, routes (incl. `[id]` detail), logs, server, nginx, updates, backups, diagnostics, templates, policies, emergency, import, endpoint-runner, alerts
- `src/modules/fleet/` — module definition + UI components (`ui/dashboard/`, `ui/onboarding/`, `ui/details/`, `ui/operations/`); `ui/details/` houses `NodeStatusPanel` and `NodeServerMonPanel` (install/update logs); `ui/details/exposeService/` houses the 6-step Expose Remote Service wizard (`ExposeServiceWizard`, `StepIdentity`, `StepTarget`, `StepAccess`, `StepPreview`, `StepDns`, `StepCreate`, `schema.ts`, `index.ts` barrel); `ui/details/terminal/` houses node-specific terminal; `ui/operations/rotate/` holds `RotateTokenFlow` and `RotateAllTokensFlow` for `EmergencyControls`; `ui/operations/AlertChannelManager.tsx` manages alerts
- `module_ideas/fleet_management.md` — full product spec (phases 1-5)

### Disk Module

- `src/app/api/modules/disk/` — disk routes for hardware health, scan, and settings; `health/cache.ts` centralizes short-lived health result caching
- `src/models/DiskSettings.ts` — persisted Disk module settings
- `src/modules/disk/` — disk module definition, page, widget, settings modal, hardware health panel, and focused UI components (`DiskSummaryCards`, `IoThroughputChart`) with colocated Vitest coverage
- `src/app/disk/` — Disk module page route and route-level tests

### Nginx Module

- `src/app/api/modules/nginx/` — Nginx routes for service status, config test/reload, DNS checks, and virtual host list/detail/create/update/delete flows
- `src/lib/nginx/` — Nginx service helpers, virtual host discovery, parser, DNS checks, and managed-config renderer with colocated Vitest coverage
- `src/modules/nginx/` — Nginx module definition, shared types, dashboard/widget UI, and host creation wizard with colocated UI tests

### Terminal & Processes

- `src/models/` — Terminal & Processes models: TerminalHistory, TerminalSession, TerminalSettings, SavedCommand, DockerAlert, DockerStatAggregate
- `src/app/api/modules/processes/`, `src/app/api/modules/terminal/`, `src/app/api/modules/docker/` — API handlers for OS processes, host terminal sessions, and Docker container management
- `src/modules/processes/`, `src/modules/terminal/`, `src/modules/docker/` — UI modules for process monitoring, web terminal, and Docker management; uses extracted component pattern (e.g., `ProcessList.tsx`, `ContainerTable.tsx`)

### Self-Service & Custom Endpoints

- `src/modules/self-service/` — Browse and install services/tools with fully managed provisioning (Nginx, SSL, systemd); logic in `engine/`, definitions in `templates/`
- `src/modules/endpoints/` — Define and manage custom API endpoints with script handlers and webhook proxying
- `src/lib/endpoints/` — Logic executors (script, logic, webhook) and token service for custom endpoints

### Apps

- `src/modules/apps/` — Linux-first managed app deployment module; v1 supports explicit-command Next.js deployments with managed release copies, systemd service generation, Nginx routing, DNS guidance, and Apps UI/widget registration
- `src/lib/apps/` — Apps deployment helpers for release paths, env masking, systemd/Nginx rendering, and the injectable deployment runner used by API routes
- `src/models/ManagedApp.ts` — persisted app metadata, commands, masked env source values, status, current release, and deployment history
- `src/app/api/modules/apps/` — Apps API routes for authenticated app list/create and deploy actions
- `src/app/apps/` — Apps module page route wrapped in `ProShell`

### AI & Automation

- `src/modules/ai-agents/` — AI agent monitoring; `ui/AIAgentsPage.tsx` displays active sessions, tool catalog, and conversation history across multiple adapters (Claude Code, Codex, Gemini CLI, etc.)
- `src/modules/ai-runner/` — automated task orchestration; `ui/AIRunnerPage.tsx` and `ui/components/` (`AutoFlowView`, `HistoryView`, etc.) manage prompts, profiles (with run-as user support), workspaces, schedules, AutoFlows, logs, prompt templates, worker concurrency, import/export, and schedule visualization; uses supervisor/worker pattern for background execution
- `src/models/AIRunnerPrompt.ts`, `src/models/AIRunnerPromptTemplate.ts`, `src/models/AIRunnerProfile.ts`, `src/models/AIRunnerWorkspace.ts`, `src/models/AIRunnerSchedule.ts`, `src/models/AIRunnerAutoflow.ts`, `src/models/AIRunnerJob.ts`, `src/models/AIRunnerRun.ts`, `src/models/AIRunnerSupervisorLease.ts`, `src/models/AIRunnerSettings.ts` — persisted AI Runner prompt library, templates, profiles (including `runAsUser` and `runAsUserAuthMode`), reusable workspaces, schedules, AutoFlows, durable job queue, run history, supervisor lease, and global settings
- `src/app/api/modules/ai-runner/` — AI Runner routes for prompts, prompt templates, prompt attachments, profiles (including validation), workspaces, schedules (including bulk update), AutoFlows, runs, logs/stream, settings, bundle import/export, directories, and direct run dispatch
- `src/modules/env-vars/` — EnvVars module definition and UI for managing host-level environment variables (stateless, bypassing MongoDB)
- `docs/ai-runner-module.md` — technical architecture for automation runner

### Crons Module

- `src/lib/crons/service.ts` — cron discovery, schedule calculation, create/update/delete actions, manual run tracking, and mock-mode support for tests and non-host environments
- `src/app/api/modules/crons/` — cron snapshot, create/update/delete, and per-job run routes with focused route coverage
- `src/modules/crons/` — Cron Jobs module definition, widget, page, type contracts, scheduling helpers, and extracted UI panels/forms under `ui/components/`

### Security & System Health

- `src/modules/security/`, `src/lib/security/` — WebAuthn passkey management, security settings, and auth audit logs
- `src/modules/certificates/`, `src/lib/certificates/` — SSL/TLS certificate monitoring, expiry alerts, and PEM parsing
- `src/modules/ports/`, `src/lib/ports/` — Host port scanning, service detection, and open port monitoring
- `src/modules/memory/`, `src/lib/memory/` — Real-time memory pressure monitoring, swap usage, and OOM risk detection
- `src/modules/guide/`, `src/modules/guide-registry.ts` — Interactive project walkthroughs and module documentation overlays

### Users, Security & Settings

- `src/models/` — Users & Settings models: User, BrandSettings, QuickAccessSettings, FileBrowserSettings, UpdateHistory, AnalyticsEvent
- `src/modules/users/` — Users & Permissions module definition and UI for managing system users, SSH access, sudo privileges, and ServerMon web access controls
- `src/app/api/modules/users/`, `src/app/api/modules/updates/`, `src/app/api/settings/` — API routes for users, system updates, and global settings (branding, quick-access)
- `src/lib/passkey-utils.ts`, `src/lib/auth-utils.ts` — Utility functions for WebAuthn passkey registration/authentication and general JWT/session auth logic
- `src/lib/analytics.ts` — Internal analytics event tracking and persistence logic
