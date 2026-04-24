# Fleet Management — Phase 5: Hardening

**Goal:** Ship-ready production mode. RBAC on dangerous endpoints, token rotation primitives, alert integrations, runtime resource-guard enforcement, integration tests for failure paths, operational runbooks.

## Wave 5A: RBAC helper + apply to dangerous endpoints

- `src/lib/fleet/rbac.ts` + `.test.ts` — defines roles `viewer`, `operator`, `admin` with a capability matrix (can_terminal, can_mutate_config, can_toggle_server, can_rotate_tokens, can_emergency, can_dispatch_endpoint, etc.). Export `requireRole(session, capability)`.
- Wire into: terminal namespace auth, `/api/fleet/emergency`, `/api/fleet/server` POST/PATCH, `/api/fleet/nodes/[id]/rotate-token`, `/api/fleet/endpoint-exec`, `/api/fleet/revisions/[id]/apply|rollback`, `/api/fleet/backups/[id]/restore`.
- Defaults: if session.role is undefined, treat as `viewer`. Existing `admin` session (from User model role='admin') gets everything. New role 'operator' for mid-tier ops.

## Wave 5B: Token rotation full flow

- `/api/fleet/emergency` already has `rotate_token` and `rotate_all_tokens`. Tighten with RBAC. Add UI to EmergencyControls for a search-select-then-rotate flow with "copy one-time token" display per rotated node.
- Add `/api/fleet/nodes/[id]/rotate-token/route.ts` — already exists; audit event + emit fleet event.

## Wave 5C: Alert integrations

- `src/models/AlertChannel.ts` — `{kind: 'webhook'|'slack'|'email', name, config}`.
- `src/models/AlertSubscription.ts` — `{channelId, eventKinds: string[], minSeverity}`.
- `src/lib/fleet/alerts.ts` + `.test.ts` — `dispatchAlert({ kind, severity, message, metadata })` → sends to each subscribed channel. Webhook: HTTP POST. Slack: Slack webhook format. Email: nodemailer stub (or just log for Phase 5 and leave SMTP config for Phase 6).
- Alert dispatch wired into: eventBus (subscribe + translate events to alerts).
- API `src/app/api/fleet/alerts/channels/route.ts` + `[id]`, `src/app/api/fleet/alerts/subscriptions/...` — CRUD.
- UI: `AlertChannelManager.tsx` + page `/fleet/alerts`.

## Wave 5D: Resource guard runtime enforcement

- `src/lib/fleet/resourceGuardMiddleware.ts` + `.test.ts` — takes a request context (userId, scope) and a limit key. Reads effective policy. Returns `{ allowed, message }`.
- Wire into Node create, PublicRoute create, terminal session open, endpoint dispatch. On hard-limit violation → 429 with actionable message. On soft-limit → proceed but emit warn FleetLogEvent.

## Wave 5E: Integration tests + docs

- Add `e2e/fleet/` Playwright tests for the happy-path flows (onboarding wizard, expose service, terminal open). Or skip if e2e infrastructure isn't configured — add expanded unit/integration tests instead that exercise cross-module paths.
- Update `DEPLOY.md` with fleet deployment notes: env vars, DNS setup, Nginx permissions, systemd service file template, Docker Compose fragment, certbot setup, backup/restore runbook.

## Wave 5F: verification + commit
