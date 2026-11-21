# Prometheus Module

## Purpose

The Prometheus module deploys and operates a managed Prometheus time-series database on the host as a Docker container. It collects ServerMon's native system metrics through a Prometheus-format exposition endpoint, scrapes user-configured targets, and serves as the metrics source for the Grafana module. It gives administrators visibility into scrape target health, ingestion rate, and storage usage without leaving ServerMon.

## Overview

- **Deployment model:** Docker-only managed deployment, following the Databases module pattern (`src/lib/databases/`, `src/models/ManagedDatabase.ts`). Not a read-only monitor.
- **Relationship to ServerMon:** ServerMon exposes its own metrics at `/api/metrics/prometheus` (text exposition format, version 4). On first deploy, the module writes a scrape job pointing at ServerMon itself, so Prometheus ingests ServerMon metrics out of the box.
- **Relationship to Grafana:** The Grafana module reads the deployed Prometheus instance's connection details (host port, local address) to auto-provision its datasource. Deploying Prometheus first is recommended but not required; Grafana can also point at an external Prometheus URL.

## Managed Deployment

- **Image:** `prom/prometheus:<pinned-tag>` (immutable tag, never `latest`).
- **Default port:** `9090` (conflict-checked against the Ports module data before deploy).
- **Exposure modes:** `local` (bind `127.0.0.1`, default) or `public` (bind all interfaces). Public exposure shows an explicit warning and requires confirmation.
- **Persistent data path:** `SERVERMON_PROMETHEUS_ROOT` (default: `/opt/servermon/prometheus`), containing:
  - `data/` — TSDB block storage (mounted to `/prometheus` in the container)
  - `config/prometheus.yml` — rendered main configuration
  - `config/scrape-targets/` — optional drop-in scrape job fragments
- **Container settings:**
  - Non-root execution (`--user 65534:65534`, `nobody`), data dir chowned at first deploy
  - `--restart unless-stopped`
  - Retention flags from module settings: `--storage.tsdb.retention.time` (default `15d`), `--storage.tsdb.retention.size` (default `10GB`)
  - `--web.enable-lifecycle` so config reloads work via HTTP without restart
  - `--web.enable-admin-api` disabled by default; toggle in settings
- **Operation logs:** every deploy/stop/restart/config-reload/delete writes to the operation log collection, mirroring the Databases module behavior.

## Setup Flow (user-visible)

1. User opens the Prometheus module page → sees a "Not deployed" card with a description and a Deploy button.
2. Deploy modal collects: host port (default 9090), exposure mode (local-only default), retention time/size, and whether to enable the admin API.
3. ServerMon validates the port is free, renders `prometheus.yml`, creates the data directories, chowns them, and starts the container.
4. A generated bearer token is written into the ServerMon scrape job; the token is stored in MongoDB and never returned in full after creation.
5. Status card turns green: container running, ServerMon target `up`, ingestion rate visible.
6. User can then add more scrape targets (see Config below) or deploy the Grafana module which will auto-discover this instance.

## ServerMon Metrics Endpoint (integration glue)

- **Route:** `src/app/api/metrics/prometheus/route.ts`
- **Format:** Prometheus text exposition format, version 4 (`Content-Type: text/plain; version=0.0.4; charset=utf-8`)
- **Auth:** `Authorization: Bearer <token>` — required. The token is generated per Prometheus deployment and auto-injected into its scrape config. Requests without a valid token return `401`. This keeps the endpoint compliant with the default-deny security posture while remaining unauthenticated-friendly for the local scraper.
- **Exported metric families (phase 1):**
  - `servermon_cpu_seconds_total` (per-core, counter) and `servermon_cpu_usage_percent` (gauge)
  - `servermon_memory_used_bytes`, `servermon_memory_total_bytes`, `servermon_swap_used_bytes`
  - `servermon_disk_used_bytes`, `servermon_disk_total_bytes` (per mount point)
  - `servermon_disk_io_read_bytes_total`, `servermon_disk_io_write_bytes_total` (per device)
  - `servermon_network_rx_bytes_total`, `servermon_network_tx_bytes_total` (per interface)
  - `servermon_uptime_seconds`
  - `servermon_process_count`, `servermon_load1` / `servermon_load5` / `servermon_load15`
- **Implementation:** reuses collectors from `src/lib/metrics/` (the same data sources behind the SSE metrics stream). Single snapshot per scrape; no MongoDB writes.
- **Scrape config for ServerMon target:**
  ```yaml
  - job_name: 'servermon'
    scheme: http
    authorization:
      type: Bearer
      credentials: <generated-token>
    static_configs:
      - targets: ['127.0.0.1:<PORT>']
  ```

## Config Management

- **Config renderer:** `src/lib/prometheus/config.ts` renders `prometheus.yml` from a validated document (global scrape interval, evaluation interval, rule files optional phase 2, scrape jobs list).
- **Scrape jobs CRUD:** users can add static targets (job name, scheme, target host:port, optional metrics path, optional bearer token). Each job is validated with Zod before render.
- **Validation before apply:** rendered YAML is validated (structure check +, when available, `promtool check config` executed inside the container via `docker exec`).
- **Apply modes:** HTTP reload via `POST /-/reload` (preferred, lifecycle flag enabled) with automatic container restart fallback if reload fails.
- **Config history:** last N rendered configs kept in MongoDB for rollback (mirror of Fleet `ConfigRevision` behavior, simplified).

## Data Sources

- `docker inspect <container>` — container state, ports, mounts, health
- `docker stats --no-stream --format json` — container CPU/memory usage
- Prometheus HTTP API (via the configured local port):
  - `GET /api/v1/targets` — scrape target states, last scrape time, error message
  - `GET /api/v1/status/config` — active configuration
  - `GET /api/v1/status/tsdb` — TSDB stats (series count, cardinality top list)
  - `GET /api/v1/query?query=up` — target up/down for charts
  - `GET /api/v1/query?query=prometheus_tsdb_head_samples_appended_total` — ingestion rate
  - `GET /api/v1/query?query=prometheus_tsdb_blocks_loaded` — loaded blocks
- `du -s` on the data dir — storage usage (disk accounting pattern from Script Runner)
- `docker logs prometheus --tail` — recent container logs for the logs panel

## Metrics/Charts

- **Target Health Table**: job name, target address, up/down badge, last scrape duration, last error
- **Ingestion Rate (Line Chart)**: samples appended per second over time (queries the local Prometheus API)
- **Scrape Duration (Bar Chart)**: per-target scrape duration, last 5 minutes
- **Storage Usage (Gauge + Pie)**: TSDB disk usage vs. retention size limit
- **Series Cardinality (Bar Chart)**: top 10 series by label count (TSDB status)
- **Container Resource Usage (Stacked Bar)**: Prometheus container CPU% and memory%
- **Live Event Feed**: recent container state changes and config reloads

## UI

- **Header**: Module title, status badge (running/stopped/unhealthy), quick actions (restart, stop, open UI)
- **Main Area**:
  - Summary cards: container status, active targets, up targets, ingestion rate, storage usage
  - Target health table with job filter
  - Charts row: ingestion rate + scrape duration
  - Scrape jobs manager: list + "Add Target" modal (job name, scheme, host:port, metrics path, auth token)
  - Settings modal: port, exposure, retention, admin API toggle, scrape interval
  - Config viewer: current rendered `prometheus.yml` (read-only with syntax highlight) + config history/rollback
  - Logs panel: container log tail (reuse the Apps/Docker log viewer component)
- **Widget** (dashboard): compact status card — running/stopped, target up count, ingestion rate, link to full page
- **Empty state:** "Not deployed" card with Deploy button and one-line pitch

## Database Schema (`src/models/ManagedPrometheus.ts`)

```ts
{
  port: number,                    // host port
  exposure: 'local' | 'public',
  dataPath: string,                // SERVERMON_PROMETHEUS_ROOT
  containerName: string,           // 'servermon-prometheus'
  image: string,                   // pinned tag
  scrapeInterval: string,          // '15s' default
  retentionTime: string,           // '15d' default
  retentionSize: string,           // '10GB' default
  adminApiEnabled: boolean,
  scrapeToken: string,             // bearer token for ServerMon endpoint (hashed at rest)
  scrapeJobs: [{                   // user-managed static jobs
    id, jobName, scheme, targets: string[], metricsPath, bearerToken?, createdAt
  }],
  configRevisions: [{ id, renderedYaml, createdAt, appliedAt }],
  containerState: { status, startedAt, restartedAt },
  operationLogs: [{ id, action, status, message, createdAt }],  // or separate collection
  createdAt, updatedAt
}
```

## API Routes (`src/app/api/modules/prometheus/`)

| Route                           | Methods           | Purpose                                                                            |
| ------------------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `route.ts`                      | `GET`             | Instance snapshot (status, container, targets summary, storage)                    |
| `route.ts`                      | `POST`            | Deploy (creates instance record + container)                                       |
| `[id]/route.ts`                 | `PATCH`, `DELETE` | Update settings (port/retention/jobs), delete instance (container + optional data) |
| `[id]/action/route.ts`          | `POST`            | start / stop / restart / reload-config                                             |
| `[id]/targets/route.ts`         | `GET`, `POST`     | Live target states from Prometheus API; add scrape job                             |
| `[id]/targets/[jobId]/route.ts` | `DELETE`, `PATCH` | Remove/update scrape job                                                           |
| `[id]/config/route.ts`          | `GET`             | Rendered config + revision history                                                 |
| `[id]/config/rollback/route.ts` | `POST`            | Apply previous revision                                                            |
| `[id]/logs/route.ts`            | `GET`             | Container log tail                                                                 |
| `[id]/storage/route.ts`         | `GET`             | TSDB/storage usage detail                                                          |

- All routes follow the API Route Checklist: try/catch, `createLogger('api:prometheus')`, Zod validation on bodies, `getSession()` auth, `export const dynamic = 'force-dynamic'`.

## Alerts/Integration

- **Thresholds:**
  - Prometheus container stopped (critical)
  - Container restart loop (> 3 restarts in 10 minutes) (critical)
  - Scrape target down for > 5 minutes (warning), > 30 minutes (critical)
  - TSDB storage > 80% of retention size (warning), > 95% (critical)
  - Ingestion rate drops to zero while targets are configured (warning)
- **Integration:** alert events stored in MongoDB and displayed in the Alerts module dashboard (same pattern as Docker alerts). Evaluation loop runs in the crons service.

## Security

- Local-only exposure by default; public exposure requires explicit confirmation and shows a warning.
- Scrape endpoint requires bearer token; token hashed at rest, shown once at creation, masked in UI afterwards.
- Admin API toggle defaults off; when on, note that it enables snapshot/delete endpoints.
- Config renderer only accepts validated job documents — no raw YAML passthrough from users in phase 1 (prevents arbitrary config injection).
- Container runs as `nobody`; data dir not world-readable.
- `docker exec` invocations sanitized and allowlisted (`promtool check config` only).

## Implementation Roadmap

### Phase 1: Foundation

- `src/models/ManagedPrometheus.ts`, `src/lib/prometheus/` (templates, config renderer, service), module definition + widget + page shell
- Deploy/stop/restart/delete flows, ServerMon metrics endpoint with bearer token
- Settings + operation logs

### Phase 2: Config & Targets

- Scrape jobs CRUD, config validation/apply/rollback, target health table, charts (ingestion, scrape duration)
- Storage usage accounting

### Phase 3: Hardening

- Alerts integration, restart-loop detection, retention enforcement verification
- `promtool` validation, config revision rollback UI, logs panel
- e2e coverage for deploy → scrape → target-down alert flow

## Impl Notes

- Docker-only; reuse `src/lib/docker/` command construction and container snapshot helpers instead of duplicating Docker CLI logic.
- Port conflict check reuses the Ports module scan before deploy.
- If Docker is unavailable, the Deploy action returns a clear error with the Docker module linked — no fallback native install in phase 1.
- Ping Prometheus via its local port with a short timeout (`fetch-utils.ts` helpers) for status; never block page render on it.
- The ServerMon scrape target should resolve to `127.0.0.1` from the container's perspective only if ServerMon listens on the host network; otherwise use the docker bridge gateway IP (`172.17.0.1`) or `host.docker.internal` on Docker Desktop — resolve this at deploy time and store it.
- Data path follows the persistent host path pattern in `src/lib/databases/` (validate root exists, create subdirs, chown, never delete data on stop — only explicit delete-with-data).
- The Grafana module discovers this instance through the `ManagedPrometheus` record; keep the record schema stable across phases.

## Acceptance Criteria

- Deploy completes without user-visible YAML; result is a running Prometheus scraping ServerMon.
- `/api/metrics/prometheus` returns valid exposition format; unauthorized requests are rejected.
- Adding a scrape job applies without container restart when lifecycle reload is available.
- Delete removes container and (optionally) data dir; nothing is left on disk unless the user chose keep-data.
- All checks pass: `pnpm check` and `pnpm format:check`.
