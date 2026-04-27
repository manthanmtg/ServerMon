# CLAUDE.md — Unified Project Guidelines for ServerMon

This file is the single source of truth for all project rules, coding conventions, and automated agent requirements.

## Mandatory Checks & Pre-merge Requirements

Every change (PR or commit to `main`) **must** satisfy these requirements:

| Check  | Command             | Expectation          |
| ------ | ------------------- | -------------------- |
| Format | `pnpm format:check` | 0 changes needed     |
| Lint   | `pnpm lint`         | 0 errors, 0 warnings |
| Types  | `pnpm typecheck`    | 0 errors             |
| Build  | `pnpm build`        | Exit code 0          |
| Tests  | `pnpm test`         | Exit code 0          |

Shortcut: `pnpm check` runs lint, typecheck, build, and tests in sequence; run `pnpm format:check` separately. **A failure in any required step blocks the merge.**

---

## Project Overview

ServerMon is a self-hosted server monitoring platform built with Next.js 16 (App Router), TypeScript, MongoDB, and Tailwind CSS 4. It follows a modular architecture where features (terminal, processes, logs, metrics) are independent modules that register into a core shell.

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

- **Default Authentication**: All routes are protected by default via `src/middleware.ts`.
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

---

## Environment Variables

Required at runtime (set in `.env.local` or `/etc/servermon/env`):

| Variable     | Required | Description                      |
| ------------ | -------- | -------------------------------- |
| `MONGO_URI`  | Yes      | MongoDB connection string        |
| `JWT_SECRET` | Yes      | Secret for signing session JWTs  |
| `PORT`       | No       | App port (default: 8912)         |
| `NODE_ENV`   | No       | `development` or `production`    |
| `LOG_LEVEL`  | No       | `debug`, `info`, `warn`, `error` |

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
- `pnpm test` — Vitest unit/integration
- `pnpm test:e2e` — Playwright end-to-end
- `pnpm format` — Prettier write
- `pnpm format:check` — Prettier check
- `pnpm check` — lint + typecheck + build + test

## Top-level Layout

- `src/` — application source (see sub-index below)
- `e2e/` — Playwright end-to-end specs
- `scripts/` — CLI helper scripts
- `public/` — static assets
- `docs/` — plans and reference docs (superpowers plans live under `docs/superpowers/plans/`)
- `module_ideas/` — product specs per module (e.g. `fleet_management.md`)
- `prompts/`, `manual_prompts/`, `issues_to_look/` — wave prompts and investigation notes
- `.env.example` — required runtime env vars (do NOT commit real `.env`)
- `CLAUDE.md`, `README.md`, `PRD.md`, `DEPLOY.md`, `AGENTS.md` — project docs

## `src/` Layout

- `src/app/` — Next.js App Router pages + `api/` route handlers
- `src/components/` — shared UI (including `layout/`, `ui/`, `modules/`)
- `src/lib/` — utilities, domain logic, fleet libraries, AI orchestration
- `src/lib/ai-agents/` — agent adapters (Claude Code, Codex, Gemini CLI) and session monitoring
- `src/lib/ai-runner/` — automated task supervisor, watchdog, and worker orchestration
- `src/models/` — Mongoose schemas
- `src/modules/` — feature modules (terminal, processes, logs, metrics, fleet, AI, etc.)
- `src/models/NetworkSpeedtestResult.ts`, `src/models/NetworkSpeedtestSettings.ts` — persisted Network module speedtest history and schedule configuration
- `src/lib/env-vars/` — stateless host environment variable helpers for OS target detection, shell env parsing, user-scope add/delete, and system-scope instructions
- `src/lib/network/speedtest.ts`, `src/lib/network/speedtest-scheduler.ts` — speedtest CLI normalization, history persistence, fixed-interval scheduling, and startup scheduler
- `src/server.ts` — custom Next.js server entry (Socket.IO bridge)
- `src/proxy.ts`, `src/proxy.test.ts` — reverse proxy helper + tests
- `src/test/` — shared test setup
- `src/types/` — ambient TypeScript types

### Fleet Management

- `src/models/` — fleet Mongoose models: Node, FrpServerState, FleetLogEvent, ConfigRevision, PublicRoute, NginxState, AgentUpdateJob, BackupJob, ResourcePolicy, AccessPolicy, RouteTemplate, DiagnosticRun, ImportedConfig, AlertChannel, AlertSubscription
- `src/lib/fleet/` — pure libraries: enums, status, pairing, toml, toml-parse, nginx, binary, frpProcess, nginxProcess, heartbeat, audit, revisions, templates, install-script, preflight, preflightExecutors, diagnostics, firewall, dns, acme, resourceGuards, resourceGuardMiddleware, access, rbac, import, backup, frpOrchestrator, nginxOrchestrator, applyEngine, orchestrators, reconcile, publicRouteLifecycle, publicRouteProxy, resolveAgentEndpoint, agentClient, agentPtyBridge, tty-bridge, hubAuth, hubTtyBridge, fleetTtyNamespace, eventBus, docsMarkdown, alerts, alertSubscriber
- `src/app/api/fleet/` — fleet HTTP routes: nodes, server, routes, nginx, templates, access-policies, resource-policies, logs, revisions (incl. `[id]/apply` + `[id]/rollback`), updates, backups, emergency, install, import, endpoint-exec, public, stream, alerts/channels (+ `[id]`), alerts/subscriptions (+ `[id]`), alerts/test
- `src/app/fleet/` — fleet UI pages: dashboard, node detail `[slug]`, onboarding, setup, routes (incl. `[id]` detail), logs, server, nginx, updates, backups, diagnostics, templates, policies, emergency, import, endpoint-runner, alerts
- `src/modules/fleet/` — module definition + shared types + UI components (`ui/dashboard/`, `ui/onboarding/`, `ui/details/`, `ui/operations/`); `ui/details/exposeService/` houses the 6-step Expose Remote Service wizard (`ExposeServiceWizard`, `StepIdentity`, `StepTarget`, `StepAccess`, `StepPreview`, `StepDns`, `StepCreate`, `schema.ts`, `index.ts` barrel); `ui/details/terminal/` houses node-specific terminal; `ui/operations/rotate/` holds `RotateTokenFlow` and `RotateAllTokensFlow` for `EmergencyControls`; `ui/operations/AlertChannelManager.tsx` manages alerts
- `module_ideas/fleet_management.md` — full product spec (phases 1-5)

### AI & Automation

- `src/modules/ai-agents/` — AI agent monitoring; `ui/AIAgentsPage.tsx` displays active sessions, tool catalog, and conversation history across multiple adapters (Claude Code, Codex, Gemini CLI, etc.)
- `src/modules/ai-runner/` — automated task orchestration; `ui/AIRunnerPage.tsx` manages scheduled runs, prompt templates, worker concurrency, import/export, and visualizes task timelines; uses supervisor/worker pattern for background execution
- `src/models/AIRunnerPromptTemplate.ts`, `src/app/api/modules/ai-runner/prompt-templates/`, `src/lib/ai-runner/service.ts` — persisted AI Runner prompt-template CRUD and bundle import/export support
- `src/modules/env-vars/` — EnvVars module definition and UI for managing host-level environment variables (stateless, bypassing MongoDB)
- `docs/ai-runner-module.md` — technical architecture for automation runner
- Env keys added: `FLEET_HUB_PUBLIC_URL`, `FRP_BIND_PORT`, `FRP_VHOST_HTTP_PORT`, `FRP_VHOST_HTTPS_PORT`, `FRP_AUTH_TOKEN`, `FRP_SUBDOMAIN_HOST`, `FLEET_HUB_AUTH_TOKEN`, `FLEET_HUB_ORCHESTRATORS_ENABLED`, `FLEET_AGENT_*`, `FLEET_NGINX_*`, `FLEET_ACME_*`, `FLEET_BINARY_CACHE_DIR`, `FLEET_FRP_VERSION`, `FLEET_FRPS_CONFIG_DIR`, `FLEET_BACKUP_DIR`, `FLEET_AUTO_APPLY_REVISIONS` (set to `'true'`), `AI_RUNNER_*` (concurrency, logs, workers)
