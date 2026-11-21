# Fleet ServerMon Guided Install Design

## Goal

Add a `ServerMon` tab to each Fleet node detail page. The tab shows the full
ServerMon app status when it is already installed on that node, and otherwise
guides an admin through installing full ServerMon on the remote machine through
the already-paired `servermon-agent`.

The first version is agent-driven only. It does not bootstrap fresh machines over
SSH. A node must already be paired, online, and capable of receiving Fleet agent
commands.

## User-Facing Behavior

- Node detail gains a `ServerMon` tab beside Overview, Terminal, Proxies, Public
  Routes, Processes, Logs, and Hardware.
- If full ServerMon is installed, the tab shows service status, detected port,
  local health, public route status, and quick actions.
- If full ServerMon is not installed, the tab shows a guided setup flow.
- The setup flow collects:
  - MongoDB URI.
  - app port, default `8912`.
  - install mode, default root-managed systemd service.
  - local MongoDB install toggle, default off for remote nodes.
  - optional public route creation.
  - route domain, default `<node-slug>-servermon.<hub-subdomain-host>`.
- After install, the tab switches to the installed-state view.
- If public route creation is enabled, the installed-state view links to the
  public URL, for example `https://node-servermon.hub.example.com/ai-runner`.

## Existing System Fit

Fleet already has the primitives this feature needs:

- Agent commands are queued in `Node.pendingCommands` and picked up during
  heartbeat.
- The current agent service runs as root, so it can install packages, write
  `/etc/servermon/env`, create `servermon.service`, and start systemd units.
- Public route creation already auto-inserts FRP proxy rules on the node and can
  auto-apply FRP and Nginx revisions.
- Fleet logs and audit events already provide a place to surface install
  progress and admin actions.

This feature should reuse those paths instead of creating a separate remote
execution channel.

## ServerMon Status Detection

The agent reports a `servermon` capability/status object in heartbeat metadata.
The hub stores the latest reported status on the node document.

Minimum reported fields:

- `installed`: boolean.
- `serviceName`: usually `servermon.service`.
- `serviceState`: `running`, `stopped`, `failed`, `unknown`, or `missing`.
- `serviceEnabled`: boolean or `unknown`.
- `port`: detected from `/etc/servermon/env`, fallback `8912`.
- `installDir`: detected working directory if available.
- `healthUrl`: `http://127.0.0.1:<port>/api/health`.
- `healthStatus`: `healthy`, `unhealthy`, or `unknown`.
- `version`: optional package or git revision summary.
- `lastCheckedAt`: ISO timestamp.
- `lastError`: optional diagnostic string.

Detection commands should be read-only:

- `systemctl show servermon.service`.
- parse `/etc/servermon/env` if readable.
- `curl --max-time 5 http://127.0.0.1:<port>/api/health`.

## Guided Install Flow

The UI flow is a compact wizard in the `ServerMon` tab:

1. **Preflight**: show node OS, architecture, memory, agent online status, and
   whether `servermon.service` already exists.
2. **Configuration**: collect MongoDB URI, port, and local MongoDB preference.
3. **Public Route**: optional route setup with a default domain derived from the
   node slug and Fleet subdomain host.
4. **Review**: show exactly what will happen, with secrets redacted.
5. **Run**: queue the install command and stream Fleet log events.
6. **Verify**: poll status until `servermon.service` is active and health passes,
   then show the public route if created.

The wizard must be admin-only. Operators can view installed status but cannot
start an install.

## Install Command

Add a new agent command, `install-servermon`, with structured args:

- `mongoUri`, delivered to the agent at heartbeat time only.
- `port`.
- `skipMongo`.
- `allowRoot`.

The agent should not accept arbitrary shell from this command. It should build a
fixed command against the checked-out ServerMon source:

```bash
cd /opt/servermon-agent/source
./scripts/install.sh --unattended --allow-root --port "$PORT" --mongo-uri "$MONGO_URI" --skip-mongo
```

If `skipMongo` is false, omit `--skip-mongo` and allow the existing installer to
attempt local MongoDB setup. For Raspberry Pi and Debian Trixie nodes, the UI
should recommend remote MongoDB because local MongoDB package support may be
unavailable.

The command runs detached enough to survive agent process restarts where
possible, but v1 may keep it as an agent-managed child process if logs and
completion are reliable. A second install request should be rejected while an
install job is active.

## Public Route Creation

If enabled, the hub validates the intended public route before the install starts
and creates the route after local ServerMon health passes. This avoids creating a
route that immediately reports `upstream_down` while the installer is still
running.

The public route request stays on the hub side. It should not be included in the
agent command because the agent only needs to install local ServerMon. The hub
can persist the route intent in the install job metadata or in redacted Fleet log
metadata keyed by command id.

Default route values:

- `name`: `<node name> ServerMon`.
- `slug`: `<node-slug>-servermon`.
- `domain`: `<node-slug>-servermon.<FRP_SUBDOMAIN_HOST>`.
- `nodeId`: current node.
- `proxyRuleName`: `servermon`.
- `target`: `127.0.0.1:<port>`, protocol `http`.
- `tlsEnabled`: true.
- `tlsProvider`: `letsencrypt`.
- `accessMode`: `servermon_auth`.
- `websocketEnabled`: true.
- `compression`: true.
- `timeoutSeconds`: 300.
- `maxBodyMb`: 64.

Using the existing public-route API keeps FRP config revisions, Nginx config
revisions, DNS checks, ACME, and rollback behavior consistent with the rest of
Fleet.

If the route domain already exists, the UI should show the conflict before the
install starts. If route creation fails after ServerMon installs successfully,
the install remains successful and the route failure is shown as a follow-up
action.

## Security And Secrets

- Only admins may start installs or change install configuration.
- Every install request records an audit event with node id, port, skipMongo,
  allowRoot, and route domain.
- MongoDB URI is treated as sensitive:
  - never write it to Fleet log messages,
  - redact it from command metadata returned to the UI,
  - do not include it in audit metadata,
  - do not store it raw in `Node.pendingCommands`,
  - store it only on the target host in `/etc/servermon/env` via the installer.
- The hub should store command secrets as an encrypted one-time payload, or in a
  TTL-backed command-secret record encrypted with a server-side key. The
  heartbeat route decrypts the MongoDB URI just before returning the command to
  the paired agent.
- The agent command must use structured args and fixed command construction, not
  arbitrary shell.
- Route creation uses the existing route validation and domain safety checks.

## Failure Behavior

- If the agent is offline, the UI disables install and explains that the node
  must reconnect first.
- If `servermon.service` is already installed, the install wizard is replaced by
  the installed-state view and offers repair/recheck actions instead.
- If prerequisites are missing, the preflight step explains what the installer
  will attempt to install.
- If the installer exits non-zero, the job is marked failed and logs are shown
  with secrets redacted.
- If service start fails, the verify step shows `systemctl status` summary and
  points to Fleet logs.
- If health fails but the service is running, the tab shows service `running`
  with health `unhealthy`.
- If public route setup fails, the local install remains available and the route
  can be retried.

## UI Direction

The tab should feel operational, matching the rest of Fleet:

- Installed state: compact status cards for Service, Health, Local Access, and
  Public Route; then actions for Recheck, Restart, Update, and Manage Route.
- Not installed state: a stepper-style guided flow with concise forms and a log
  panel during execution.
- Avoid marketing copy. The tab is a tool for operating a node.
- Do not expose raw install commands as the primary path. The UI should own the
  workflow while logs make the work inspectable.

## API And Data Model Direction

Add focused Fleet APIs:

- `GET /api/fleet/nodes/[id]/servermon` returns detected ServerMon status and
  matching public route, if any.
- `POST /api/fleet/nodes/[id]/servermon/install` validates config, queues
  `install-servermon`, prevalidates optional public route intent, and returns a
  job id.
- `POST /api/fleet/nodes/[id]/servermon/recheck` queues or triggers a status
  refresh.
- `POST /api/fleet/nodes/[id]/servermon/restart` queues a restart command.
- `POST /api/fleet/nodes/[id]/servermon/route` creates the saved public route
  intent after local health passes, or retries route setup after a prior route
  failure.

Persist latest detected status on `Node`, and use Fleet log events for install
history. A dedicated install-job model is optional for v1; add it only if log
events are not enough to represent in-progress, succeeded, and failed states.

## Testing Plan

Add focused tests for:

- ServerMon status detection parsing installed, missing, failed, and unhealthy
  states.
- install request validation and RBAC.
- MongoDB URI redaction in logs, audit records, and API responses.
- `install-servermon` command construction for skip-local-Mongo and local-Mongo
  modes.
- duplicate install rejection while an install is active.
- default public route payload generation.
- route conflict handling before install starts.
- installed-state UI rendering.
- guided wizard validation and submit behavior.
- verify step transitions from queued install to installed service, then from
  saved route intent to active public route.

## Out Of Scope

- SSH-based bootstrap of machines that do not already have `servermon-agent`.
- Installing or managing MongoDB clusters for production use.
- Full rollback of an installed ServerMon instance.
- Multi-node bulk install.
- Automatic public DNS record creation outside the existing Fleet DNS/route
  checks.
- Non-systemd service management in v1.
