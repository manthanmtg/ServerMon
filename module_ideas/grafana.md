# Grafana Module

## Purpose

The Grafana module deploys and operates a managed Grafana instance on the host as a Docker container, auto-provisioned with the deployed Prometheus module as its default datasource. Grafana's UI is embedded inside ServerMon through a session-guarded sidecar proxy, so administrators build and view dashboards without leaving the platform or managing a second login.

## Overview

- **Deployment model:** Docker-only managed deployment, following the Databases module pattern (`src/lib/databases/`, `src/models/ManagedDatabase.ts`), including the sidecar proxy approach used by the Databases explorer (`explorer-scheduler.ts`).
- **Relationship to Prometheus:** On deploy, the module checks for a deployed Prometheus instance (`ManagedPrometheus` record). If found, it writes Grafana datasource provisioning pointing at it. If not, it asks for an external Prometheus URL (or the user can deploy Prometheus first — recommended path).
- **Embedding:** Grafana is never exposed directly in phase 1. All traffic flows through a ServerMon sidecar proxy route so the platform's auth cookie protects the dashboard UI, and no anonymous Grafana port needs to be open.

## Managed Deployment

- **Image:** `grafana/grafana:<pinned-tag>` (immutable tag, never `latest`).
- **Default port:** `3000` (bound to `127.0.0.1` only — the sidecar proxy is the intended access path; conflict-checked against the Ports module data).
- **Persistent data path:** `SERVERMON_GRAFANA_ROOT` (default: `/opt/servermon/grafana`), containing:
  - `data/` — Grafana SQLite database and internal state (mounted to `/var/lib/grafana`)
  - `config/provisioning/datasources/datasources.yml` — auto-rendered Prometheus datasource
  - `config/provisioning/dashboards/dashboards.yml` — dashboard provider pointing at the `dashboards/` folder
  - `dashboards/` — provisioned dashboard JSON files (phase 2: bundled ServerMon starter dashboards)
  - `logs/` — container logs mount
- **Container settings:**
  - Non-root execution (`--user 472:472`, `grafana`), data/config dirs chowned at first deploy
  - `--restart unless-stopped`
  - `GF_SERVER_ROOT_URL` set to the sidecar proxy path so links/redirects stay inside the embed
  - `GF_SECURITY_ADMIN_USER` / `GF_SECURITY_ADMIN_PASSWORD` — generated admin credentials, stored (password hashed at rest, shown once)
  - `GF_USERS_ALLOW_SIGN_UP=false`
  - `GF_AUTH_ANONYMOUS_ENABLED=true` with `org_role: Viewer` — optional toggle (default off in phase 1, on only if the user opts in) so the embedded view never prompts for login; admin actions still require the generated admin login
  - Plugins: user-selectable allowlist (phase 2), installed via `GF_INSTALL_PLUGINS` at deploy time
- **Operation logs:** every deploy/stop/restart/delete/provision change writes to the operation log, mirroring the Databases module.

## Setup Flow (user-visible)

1. User opens the Grafana module page → "Not deployed" card with a Deploy button.
2. Deploy modal collects: host port (default 3000), datasource choice ("Use deployed Prometheus" — preselected when available / "External Prometheus URL"), exposure of anonymous Viewer mode (off by default).
3. ServerMon generates admin credentials, renders provisioning files, creates directories, chowns them, and starts the container bound to localhost.
4. Sidecar proxy starts and the page switches to the embedded Grafana dashboard view.
5. Credentials modal shows the admin username/password once, with a copy button and a "reset password" action (redeploy with new `GF_SECURITY_ADMIN_PASSWORD`).
6. First-run dashboard browsing works immediately against the auto-provisioned Prometheus datasource.

## Sidecar Proxy (embedding)

- **Route:** `src/app/grafana/embed/[[...path]]/route.ts` (catch-all) — authenticated with `getSession()`; unauthenticated requests get the standard platform redirect.
- **Behavior:**
  - Forwards method, path, and query to `127.0.0.1:<port>/<path>` using `fetch-utils.ts` helpers (timeouts, safe error surfacing).
  - Rewrites `Location` headers and absolute redirects to stay inside the embed path.
  - Streams HTML/CSS/JS bodies through without buffering (Grafana serves large bundles).
  - WebSocket/live features: proxied over the existing Socket.IO bridge pattern from `src/server.ts` (phase 2 — phase 1 uses Grafana's default polling mode with `GF_FEATURE_TOGGLES` left at defaults).
- **Session rule:** this proxy is a sensitive boundary — verify `getSession()` in the handler per the security checklist, and never forward the ServerMon session cookie to Grafana.
- **Why sidecar and not direct port access:** keeps Grafana off the public interface entirely, enforces ServerMon auth on every request, and makes the embed same-origin so the iframe has no third-party cookie problems.

## Data Sources

- `docker inspect <container>` — container state, ports, mounts, health
- `docker stats --no-stream --format json` — container CPU/memory usage
- Grafana HTTP API via the local port (using the generated admin credentials server-side only):
  - `GET /api/health` — liveness + database state
  - `GET /api/datasources` — datasource list and health (verifies Prometheus datasource is reachable)
  - `GET /api/dashboards` — dashboard inventory for the dashboards panel
  - `POST /api/admin/stats` — user/org counts for the summary cards (read-only)
- Provisioning files on disk — source of truth for datasource/dashboard provisioning state
- `docker logs grafana --tail` — recent logs for the logs panel

## Metrics/Charts

- **Instance Health (Status Card)**: running/stopped/unhealthy badge, uptime, datasource health
- **Datasource Health Table**: datasource name, type, URL (masked), last check result
- **Dashboards Table**: title, folder, last updated, tags, star count, open-in-embed link
- **Container Resource Usage (Stacked Bar)**: Grafana container CPU% and memory%
- **Request Latency (Line Chart, phase 2)**: proxied request latency percentiles from the sidecar proxy instrumentation
- **Live Event Feed**: container state changes, provisioning updates, password resets

## UI

- **Header**: Module title, status badge, quick actions (restart, stop, open embed, credentials)
- **Main Area** (embedded mode):
  - Full-height iframe of the sidecar proxy with a slim toolbar (back to module page, open in new tab, reload)
- **Main Area** (manage mode, toggled by a "Manage" tab):
  - Summary cards: instance status, datasource health, dashboard count, storage usage
  - Datasource panel: list + "Update datasource" (re-render provisioning + restart)
  - Dashboards panel: provisioned dashboard list (phase 2 includes "install starter dashboard" actions that write JSON into `dashboards/`)
  - Credentials modal: show-once admin credentials, reset action
  - Settings modal: port, anonymous Viewer toggle, plugins allowlist
  - Logs panel: container log tail (reuse the Apps/Docker log viewer component)
- **Widget** (dashboard): compact status card — running/stopped, datasource healthy, dashboard count, link to embed
- **Empty state:** "Not deployed" card; if Prometheus is not deployed either, the card suggests deploying Prometheus first

## Database Schema (`src/models/ManagedGrafana.ts`)

```ts
{
  port: number,                    // host port (localhost-bound)
  dataPath: string,                // SERVERMON_GRAFANA_ROOT
  containerName: string,           // 'servermon-grafana'
  image: string,                   // pinned tag
  adminUser: string,
  adminPasswordHash: string,       // shown once at creation, reset supported
  anonymousViewer: boolean,
  datasource: {
    mode: 'local' | 'external',
    prometheusInstanceId?: ObjectId,   // ManagedPrometheus reference
    externalUrl?: string,              // masked in UI
    name: string,                      // 'ServerMon Prometheus'
  },
  plugins: string[],               // GF_INSTALL_PLUGINS list
  provisionedDashboards: [{ id, title, file, updatedAt }],
  containerState: { status, startedAt, restartedAt },
  operationLogs: [{ id, action, status, message, createdAt }],
  createdAt, updatedAt
}
```

## API Routes (`src/app/api/modules/grafana/`)

| Route                        | Methods                        | Purpose                                                          |
| ---------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| `route.ts`                   | `GET`                          | Instance snapshot (status, datasource health, dashboard count)   |
| `route.ts`                   | `POST`                         | Deploy (creates instance record + container + provisioning)      |
| `[id]/route.ts`              | `PATCH`, `DELETE`              | Update settings; delete instance (container + optional data)     |
| `[id]/action/route.ts`       | `POST`                         | start / stop / restart / reprovision                             |
| `[id]/credentials/route.ts`  | `POST`                         | Reset admin password (redeploy with new generated credentials)   |
| `[id]/dashboards/route.ts`   | `GET`, `POST`                  | List provisioned dashboards; install starter dashboard (phase 2) |
| `[id]/logs/route.ts`         | `GET`                          | Container log tail                                               |
| `embed/[[...path]]/route.ts` | `GET`, `POST`, `PUT`, `DELETE` | Session-guarded sidecar proxy to the local Grafana port          |

- All routes follow the API Route Checklist: try/catch, `createLogger('api:grafana')`, Zod validation on bodies, `getSession()` auth, `export const dynamic = 'force-dynamic'`.

## Alerts/Integration

- **Thresholds:**
  - Grafana container stopped (critical)
  - Container restart loop (> 3 restarts in 10 minutes) (critical)
  - Prometheus datasource unhealthy for > 5 minutes (warning)
  - Sidecar proxy error rate spike (phase 2)
- **Integration:** alert events stored in MongoDB and displayed in the Alerts module dashboard. Evaluation loop runs in the crons service.

## Security

- Grafana binds to `127.0.0.1` only; never exposed directly. Public dashboard access goes through the authenticated sidecar proxy.
- Sidecar proxy verifies `getSession()` on every request; ServerMon cookies are never forwarded to Grafana.
- Admin password generated (crypto random), hashed at rest, displayed once, masked afterwards; reset flow regenerates and redeploys.
- Anonymous Viewer mode is opt-in; when enabled, the embedded viewer cannot change dashboards (org role Viewer) and admin data remains protected by the generated admin login.
- `GF_USERS_ALLOW_SIGN_UP=false`; only the admin account exists by default.
- User-controlled dashboard JSON (phase 2) is validated with Zod before being written into the `dashboards/` folder.
- `docker exec` invocations sanitized and allowlisted (none required in phase 1).

## Implementation Roadmap

### Phase 1: Foundation

- `src/models/ManagedGrafana.ts`, `src/lib/grafana/` (templates, provisioning renderer, service), module definition + widget + page shell
- Deploy/stop/restart/delete flows with auto datasource provisioning
- Sidecar proxy embed + credentials show-once/reset

### Phase 2: Dashboards & Polish

- Starter dashboard library (ServerMon CPU/memory/disk/network) written to the provisioned dashboards folder
- Plugins allowlist, WebSocket live-query proxying over the Socket.IO bridge
- Proxy latency instrumentation, dashboards management UI

### Phase 3: Hardening

- Alerts integration, restart-loop detection, datasource health checks in crons
- Logs panel, operation log retention
- e2e coverage: deploy → embed loads → datasource healthy → starter dashboard renders

## Impl Notes

- Docker-only; reuse `src/lib/docker/` helpers and the Databases explorer sidecar scheduler patterns — do not duplicate container lifecycle logic.
- Always check the `ManagedPrometheus` record at deploy time; store the reference, not a hardcoded URL, so a Prometheus port change can propagate (reprovision action re-renders `datasources.yml`).
- Discovery of the local Prometheus URL: if Prometheus binds `127.0.0.1`, use the docker bridge gateway IP or `host.docker.internal` from the Grafana container's perspective — resolve at deploy/reprovision time (same concern as the Prometheus module's ServerMon target).
- The sidecar proxy must stream responses (no full-body buffering) and strip hop-by-hop headers; follow `src/proxy.ts` header-handling conventions.
- Never log admin credentials or the datasource URL with embedded credentials; mask in all API responses (`env masking` pattern from `src/lib/apps/`).
- If Docker is unavailable, the Deploy action returns a clear error with the Docker module linked.
- Data path follows the persistent host path pattern in `src/lib/databases/`; delete-with-data is explicit and confirmed in a modal.
- Keep the `datasource` block in the model forward-compatible so phase 2 can add Loki/Jaeger datasources without a breaking change.

## Acceptance Criteria

- Deploy completes with zero manual Grafana setup; embedded UI loads and shows the auto-provisioned Prometheus datasource healthy.
- Unauthenticated requests to the embed route are redirected to login; ServerMon cookies never reach Grafana.
- Admin credentials are shown exactly once and masked everywhere else; reset produces new working credentials.
- Deleting the instance removes the container and (optionally) data dir; nothing is left on disk unless the user chose keep-data.
- All checks pass: `pnpm check` and `pnpm format:check`.
