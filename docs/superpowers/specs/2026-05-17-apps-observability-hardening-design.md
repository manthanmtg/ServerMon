# Apps Observability Hardening Design

## Overview

The Apps module needs to behave like an operations surface, not a fire-and-forget form. Deploy, update, delete, and rollback actions should expose what is happening, what happened last, and how the managed app is behaving at runtime. This hardening pass adds persistent operation records, per-app systemd resource snapshots, journal log access, rollback controls, and a clearer UI for active and recent activity.

## Key Decisions

- Keep the current synchronous deploy/update APIs for this pass, but record operation progress before, during, and after each action so users can refresh and still understand the last action.
- Reuse the existing systemd and journalctl service-management patterns instead of creating a second process inspection stack.
- Store operation history on the existing `ManagedApp` document to avoid introducing another collection before the Apps module has higher action volume.
- Treat rollback as a first-class app action that repoints `current` to an existing release, restarts the service, health-checks it, and records the result.
- Keep resource snapshots best-effort. If systemd or accounting fields are unavailable, the UI shows an explicit unavailable state instead of pretending the app is healthy.

## Data Model

Each managed app gains an `operations` array. Each operation stores:

- id, type, status, title, current step, started/completed timestamps
- logs, error, release id, and commit sha when available

The API DTO exposes recent operations plus a `runtime` object:

- systemd service name, availability, active/sub state, PID, CPU, memory, uptime, restart count
- latest runtime error when inspection fails

Release history remains the durable deployment record. Operations are the activity trail and live status surface.

## Backend Flow

Deploy and update actions create a running operation before source preparation. Deployment helpers receive a log callback so command-level progress is saved while the request is in flight. Success and failure both complete the operation with logs, error context, and relevant release information.

Rollback validates the target release belongs to the app and has a usable release directory, switches the `current` symlink, restarts the app service, runs the app health check, marks releases active/superseded, and records a rollback operation.

List endpoints enrich app DTOs with runtime snapshots. A dedicated logs endpoint returns recent journal entries for the managed app service.

## UI

The Apps page keeps the current app cards but adds:

- summary cards for running, failed, and active operations
- an expanded Runtime panel with service state, PID, CPU, memory, uptime, and restarts
- an Operations panel with active/recent operation status and logs
- a Logs viewer modal fed by the app-specific journal endpoint
- rollback controls from deployment history for previous active-capable releases
- clearer button feedback after update/deploy/rollback so the user sees whether nothing changed, a release changed, or a failure occurred

The UI stays utilitarian and dense, matching ServerMon's operational modules.

## Error Handling

- API routes require admin sessions, validate IDs through existing DB lookups, and return structured `{ error }` payloads.
- Runtime inspection failures do not block app listing.
- Operation completion is best-effort in catch paths; original action errors remain visible to callers.
- Logs are bounded to avoid huge API payloads.

## Testing

Unit tests cover:

- DTO mapping of operation and runtime fields
- operation recording for deploy/update success and failure
- rollback release switching and invalid release rejection
- logs/runtime API authorization and service calls
- Apps page rendering of runtime, operation progress, log modal, and rollback controls

Required verification remains `pnpm format:check` and `pnpm check`.

## Non-Goals

- A detached queue worker or WebSocket/SSE operation stream
- Long-term metrics retention and charts
- Per-app alert subscriptions
- Docker/runtime isolation changes
- Multi-node app deployment
