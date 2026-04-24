# Module Spec: Fleet Management (Master-Agent architecture via FRP)

## Overview
This module evolves ServerMon from a standalone system into a **Fleet Management Platform**. It enables a central, cloud-hosted **Master Hub** (e.g., `ultron.manthanby.cv`) to orchestrate multiple remote **Agents** (e.g., your home PC `orion`) located behind NAT/Firewalls.

**Core Engine:** [fatedier/frp](https://github.com/fatedier/frp).
ServerMon wraps FRP, automating the binary management, config generation, and tunnel maintenance.

---

## 1. Master-Agent Architecture

### The Master Hub (Cloud)
- Runs the main Next.js application and the `frps` (server) daemon.
- Aggregates health data from all agents.
- Provides the UI for terminal access and proxy routing.
- Handles reverse proxying for dynamic subdomains (e.g., `orion.manthanby.cv`).

### The Agent (Edge/Home)
- A lightweight version of ServerMon running in `--agent` mode.
- Initiates an **outbound** connection to the Hub via `frpc` (client).
- Carries out local actions: system monitoring, script execution, and spawning terminal shells (`node-pty`).
- Requires **zero** port-forwarding on the home router.

---

## 2. Exhaustive Technical Details

### A. Tunnel Orchestration (`src/lib/tunnel`)
ServerMon will manage the lifecycle of FRP binaries.
- **Auto-Discovery:** Upon startup, ServerMon detects the host OS/Arch (Linux x64, ARM64, MacOS) and automatically downloads the corresponding pre-compiled FRP binary if not present.
- **Config Generation:** TOML configs are never written manually. ServerMon generates `frps.toml` (Master) and `frpc.toml` (Agent) dynamically from the database.

**Hub `frps.toml` Example (Internal):**
```toml
bind_port = 7000
vhost_http_port = 8080 # FRP routes HTTP traffic here
auth.token = "random_hub_secret"
subdomain_host = "manthanby.cv"
```

**Agent `frpc.toml` Example (Dynamic):**
```toml
server_addr = "ultron.manthanby.cv"
server_port = 7000
auth.token = "random_hub_secret"

[[proxies]]
name = "orion-terminal"
type = "tcp"
local_ip = "127.0.0.1"
local_port = 8001
remote_port = 9001  # Tunnel for WebSockets/TTY

[[proxies]]
name = "home-web-app"
type = "http"
local_ip = "127.0.0.1"
local_port = 3000
subdomain = "orion"
```

### B. Guided Agent Onboarding Flow
The user experience must be "1-click" simple:
1. **Cloud UI:** User clicks "Add New Machine" and enters a name (e.g., `orion`).
2. **Database:** Master generates a `node_id` and a unique `pairing_token`.
3. **FRPC Configuration Wizard:** Before showing the install command, the UI explicitly asks the user which `frpc` options should be enabled for this client. This must not be hidden behind defaults because encryption, compression, protocol, TLS, pool count, heartbeat, and proxy behavior affect security and reliability.
   - **Required Choices:**
     - Transport protocol: `tcp`, `kcp`, `quic`, or `websocket` where supported by the installed FRP version.
     - TLS: enabled by default for production, with certificate verification settings surfaced.
     - FRP transport encryption: enabled by default unless TLS-only is intentionally selected.
     - Compression: optional, with a note that it can reduce bandwidth but increase CPU usage.
     - Heartbeat interval/timeout and reconnect behavior.
     - Proxy types to create at onboarding: terminal tunnel, HTTP subdomain, TCP port forward, or none yet.
     - Local bind targets for each proxy (`local_ip`, `local_port`) with validation.
     - Access control options: allowed users/roles, tags, environment labels, and maintenance mode.
   - **Advanced Config:** Provide an "Advanced FRPC Config" step for custom FRP-compatible fields. The UI should validate the values, store them as structured config, and preserve an audit trail of who changed them.
   - **TOML Preview:** The wizard must show a read-only/generated `frpc.toml` preview that updates live based on the selected options. The user can copy it for inspection, but the source of truth remains the database-generated structured config.
   - **Dry Run Validation:** Before completing onboarding, ServerMon validates that generated TOML parses, required ports are available, proxy names are unique, reserved ports are not used, and the selected features are supported by the bundled FRP binary.
4. **UI Display:** Master shows a terminal command:
   ```bash
   curl -sL https://ultron.manthanby.cv/install-agent.sh | bash -s -- --hub-url ultron.manthanby.cv --token MY_TOKEN
   ```
5. **Agent Setup:** The script downloads ServerMon (or pulls the Docker image), detects the environment, registers the `frpc` service, and connects.
   - *Docker Alternative:* User can simply run `docker run -d --name servermon-agent ...` with the token passed as an env var.
6. **First Connection Verification:** The Hub waits for the agent heartbeat, confirms `frpc` is connected, verifies configured proxies are registered in `frps`, and shows any failed proxy with a specific error.
7. **Success:** The Hub UI instantly lights up green for "Orion: Online".

The onboarding flow should feel end-to-end and polished: identity -> network/DNS checks -> FRPC settings -> generated TOML preview -> install command -> live verification -> ready state. The user should never need to manually guess FRP config fields to get a working client.

### C. Browser-Based Terminal (The "SSH" Replacement)
Instead of raw SSH ports, we use a WebSocket-to-TTY bridge over the FRP tunnel.
1. **Agent:** Runs a small WebSocket server on a local port (e.g., `8001`).
2. **Master:** Exposes a UI running `xterm.js`.
3. **Route:** Keystrokes -> Master WebSocket -> FRP Tunnel -> Agent WebSocket -> `node-pty` Shell.
4. **Security:** No SSH keys are needed. Authentication is handled by the ServerMon Hub session.

### D. Distributed Endpoints & Fleet Actions
The existing "Endpoints" feature will be updated with a `target` selection.
- **Single Target:** Execute a script on one specific Agent (or the Hub).
- **Fleet-Wide (Broadcast):** Select a tag (e.g., `#webservers`) or "All Nodes" to broadcast a script execution. 
- **Real-time Feedback:** The Hub aggregates results in a unified view, showing which nodes succeeded and which failed. Useful for fleet-wide software updates or security audits.

### E. Cloud Ingress & Nginx Management
Remote services must be publishable from the Hub without manually editing cloud Nginx config.

Example: a service is running on remote agent `orion` at `127.0.0.1:3000`, and the user wants it available as `photos.manthanby.cv` or `orion-photos.manthanby.cv`. ServerMon should configure the entire path:
1. Create/update the agent `frpc` HTTP proxy for the remote local service.
2. Register the route in `frps` using the selected subdomain/custom domain.
3. Generate the cloud Nginx server block or route snippet.
4. Provision or verify TLS certificates.
5. Test the route end-to-end and show the final public URL.

- **Domain Route Wizard:** Add a UI flow for "Expose Remote Service" from a node detail page or global routes page.
  - Select node/client.
  - Enter remote local service target (`local_ip`, `local_port`, protocol).
  - Choose public domain/subdomain (`photos.manthanby.cv`, `orion.manthanby.cv`, etc.).
  - Choose path behavior: whole domain, path prefix, WebSocket support, HTTP/2, max body size, timeouts, headers, and compression.
  - Choose access mode: public, authenticated through ServerMon, IP allowlist, basic auth, or disabled.
  - Preview generated `frpc.toml`, `frps.toml`, and Nginx config before applying.
- **Nginx Config Management:** ServerMon owns generated Nginx snippets under a dedicated managed directory, never mixed with hand-written config.
  - Generate per-route server blocks/snippets.
  - Run `nginx -t` before reload.
  - Reload Nginx only after config validation succeeds.
  - Keep versioned config revisions with diff and rollback.
  - Detect and warn about unmanaged conflicting server names.
- **TLS/Certificate Management:** Support Let's Encrypt/ACME, existing certificate paths, or reverse-proxy-provided certificates.
  - Verify certificate coverage for selected domain.
  - Track certificate expiry and renewal status.
  - Show failures clearly if DNS is not ready for ACME validation.
- **DNS Verification:** Check that the chosen domain resolves to the Hub before enabling the route.
  - Support wildcard DNS (`*.manthanby.cv`) and explicit records (`photos.manthanby.cv`).
  - Show exact missing/incorrect records and expected values.
- **Route Health Checks:** After applying, ServerMon probes the public URL, Nginx upstream, FRP proxy, and remote local target.
  - Status should explain whether failure is DNS, TLS, Nginx, FRP, or remote service down.
  - Node cards and route tables should show route health separately from node health.
- **WebSocket & Streaming Support:** Nginx generation must support WebSocket upgrade headers, long-lived responses, SSE, file uploads, and configurable timeouts.
- **Safe Disable/Delete:** Disabling a public route should remove or disable the Nginx route and FRP proxy together, with audit logs and rollback.
- **No Manual Cloud Step Required:** A user should not have to SSH into the cloud machine and edit Nginx by hand for normal remote service publishing.

### F. Global FRP Control Plane
Production deployments need an obvious way to pause or restore tunnel traffic without deleting client configuration.
- **Global FRP Server Toggle:** Add a Hub-level on/off control for the `frps` service. When off, the UI clearly states that all tunnels are paused and no client routes are reachable.
- **Safe Disable Flow:** Turning the server off requires confirmation, records an audit event, stops accepting new FRP connections, and optionally drains active terminal sessions before hard stop.
- **Restart/Reconfigure:** The Hub can restart `frps` after config changes, rotate tokens, reload generated config, and show whether the restart succeeded.
- **Service State:** Show `frps` state separately from fleet state: `running`, `stopped`, `starting`, `stopping`, `degraded`, `failed`.
- **Blast Radius Warning:** If disabling `frps` will affect online clients, show the number of connected clients, active terminals, and active proxy routes before confirmation.

### G. Status Model & Presence Semantics
Client status must be visible, precise, and trustworthy.
- **Node Statuses:** `online`, `offline`, `connecting`, `degraded`, `maintenance`, `disabled`, `unpaired`, `error`.
- **Tunnel Statuses:** `connected`, `reconnecting`, `disconnected`, `auth_failed`, `config_invalid`, `proxy_conflict`, `unsupported_config`.
- **Proxy Statuses:** `active`, `disabled`, `failed`, `port_conflict`, `dns_missing`, `upstream_unreachable`.
- **Public Route Statuses:** `active`, `disabled`, `pending_dns`, `cert_failed`, `nginx_invalid`, `nginx_reload_failed`, `frp_unreachable`, `upstream_down`, `degraded`.
- **Last Seen:** Every node card and detail page shows last heartbeat time, connection duration, FRP version, agent version, and the last error if any.
- **Status Source:** Status must be computed from both ServerMon heartbeats and FRP process/proxy state, not just one polling flag.
- **Real-Time Updates:** Use SSE/WebSocket updates where appropriate so the dashboard reflects up/down transitions without requiring refresh.

### H. Logging & Audit Trails
Logging is a first-class feature, not an implementation detail.
- **Global Logs Page:** Fleet-wide view for Hub, `frps`, Nginx, onboarding, config changes, token rotation, service restarts, failed auth, and DNS/proxy failures.
- **Client Logs Page:** Per-node logs for agent lifecycle, `frpc` stdout/stderr, generated config version, heartbeat events, proxy registration, terminal session events, and endpoint execution.
- **Server-Level Logs:** Dedicated view for `frps` process logs, connection events, active proxies, rejected clients, and bind/listen errors.
- **Nginx Logs:** Per-route access/error logs, reload/test output, certificate issuance logs, upstream failures, and request correlation IDs where possible.
- **Filtering:** Filter by node, route, domain, severity, service (`servermon`, `frps`, `frpc`, `nginx`, `acme`, `terminal`, `endpoint-runner`), time range, event type, and correlation ID.
- **Retention:** Configurable retention with sane defaults, log rotation, and storage limits so logs do not fill disk.
- **Audit Events:** Any security-sensitive action, including adding clients, editing FRPC config, adding public domains, reloading Nginx, toggling `frps`, rotating tokens, deleting nodes, or opening terminals, must produce an immutable audit entry.

### I. Agent Lifecycle & Upgrade Management
Agents must be manageable after onboarding, not treated as one-time installs.
- **Version Inventory:** Hub shows ServerMon agent version, `frpc` version, install method, OS/arch, service manager, last update time, and compatibility status for every node.
- **One-Click Updates:** Support updating one agent, selected agents, agents by tag, or the whole fleet.
- **Staged Rollouts:** Roll out updates in batches with pause, resume, cancel, and automatic stop-on-failure thresholds.
- **Rollback:** Keep enough previous install metadata to roll an agent back to the last known-good version where supported.
- **Compatibility Checks:** Warn when an agent is too old for a Hub feature, an FRP version does not support selected config, or a platform cannot run a requested capability.
- **Update Logs:** Every update attempt records command output, status, duration, user, version before/after, and rollback availability.

### J. Backup, Restore & High Availability
The fleet control plane must have a recovery story before production use.
- **Backup Scope:** Back up fleet metadata, node records, public routes, structured config, config revisions, Nginx managed snippets, certificate metadata, access policies, configurable limits, audit metadata, and log retention settings.
- **Secret Handling:** Backups must not leak raw secrets by default. If restorable encrypted secrets are included, they require an explicit encryption key strategy.
- **Restore Flow:** A restored Hub should recover enough state to reconnect existing agents without manually recreating every node and route.
- **Scheduled Backups:** Support configurable automatic backups with retention and backup health status.
- **Disaster Recovery Mode:** Provide a documented and UI-assisted path for restoring a Hub onto a new cloud machine, revalidating DNS/TLS/Nginx/FRP, and resuming routes.
- **High Availability Plan:** Document a baseline single-Hub recovery model and an optional future HA model using external MongoDB, shared config storage, standby Hub, and DNS/failover strategy.

### K. Cloud Firewall & Network Preflight
Cloud-side connectivity problems should be detected before the user spends time debugging.
- **Port Checks:** Verify that required inbound ports are reachable: public HTTP/HTTPS, `frps` bind port, FRP vhost ports, and any configured TCP remote ports.
- **Local Bind Checks:** Verify Hub services are listening on expected local ports and that Nginx can reach `frps`.
- **Cloud Firewall Guidance:** Surface likely cloud firewall/security-group issues with exact ports and protocols to open.
- **External Reachability:** Run outside-in checks where possible and clearly distinguish local listen success from public internet reachability.
- **Preflight Report:** Show a Hub readiness report covering DNS, TLS, Nginx, FRP, firewall, MongoDB, disk, permissions, and service manager status.

### L. Route Templates & Service Catalog
Publishing common services should be fast and hard to misconfigure.
- **Built-In Templates:** Include templates for generic HTTP, generic TCP, Next.js, Grafana, Home Assistant, Jellyfin, WebSocket app, static web app, admin-only app, and terminal-only access.
- **Template Defaults:** Each template defines default local port, protocol, WebSocket support, timeout profile, upload limits, headers, access policy, health check path, and logging level.
- **Custom Templates:** Users can save a working public route as a reusable template.
- **Template Preview:** Applying a template still shows generated FRP/Nginx/TLS config before activation.

### M. Access Policies & Agent Capabilities
Access must be configurable per route and per agent.
- **Per-Route Access:** Public routes support `public`, `servermon_auth`, `ip_allowlist`, `basic_auth`, `temporary_share`, `disabled`, and future SSO/OIDC modes.
- **Schedules:** Routes can optionally be available only during configured time windows.
- **Agent Capabilities:** Each agent has capability flags for terminal access, endpoint execution, process management, metrics, public route publishing, TCP forwarding, file operations, and updates.
- **Policy Enforcement:** Hub and agent both enforce capability restrictions so UI hiding is not the only control.
- **Temporary Access:** Temporary shares must have expiry, revocation, audit logs, and optional password/IP restrictions.

### N. Configurable Resource Guards
Production instances need configurable limits to avoid accidental overload.
- **Configurable Limits:** Admins can configure max agents, public routes, proxy rules per node, active terminals, endpoint runs, log retention, log storage size, bandwidth warning thresholds, upload body size, request timeout, and update rollout batch size.
- **Soft/Hard Limits:** Support warning-only soft limits and enforcement hard limits.
- **Quota Visibility:** Dashboards show current usage against configured limits.
- **Limit Events:** Hitting a limit creates an actionable alert and audit/log event.
- **Per-Scope Limits:** Allow global defaults with optional overrides per node, tag, route, or user role.

### O. Troubleshooting Assistant
Every client and route should have a built-in diagnostic chain.
- **Route Diagnostics:** `DNS -> TLS -> Nginx config -> Nginx reload/runtime -> frps route -> frpc tunnel -> remote local port -> public URL`.
- **Client Diagnostics:** `Hub reachability -> token/auth -> frps connection -> frpc config -> heartbeat -> service manager -> local capabilities`.
- **Actionable Results:** Each diagnostic step returns pass/fail/unknown, raw evidence, likely cause, and recommended fix.
- **One-Click Recheck:** Users can rerun diagnostics after changing DNS, firewall, config, or restarting services.
- **Shareable Report:** Generate a sanitized troubleshooting report for support without exposing secrets.

### P. Emergency Controls
Operators need fast, safe controls when something is wrong.
- **Emergency Actions:** Disable all public routes, stop all terminal sessions, stop all endpoint runs, revoke one agent, rotate one token, rotate all tokens, pause agent updates, put fleet in maintenance mode, and stop `frps`.
- **Confirmation & Impact:** Every emergency action shows blast radius, affected nodes/routes/sessions, rollback availability, and requires confirmation.
- **Break-Glass Audit:** Emergency actions are always audit logged with user, reason, timestamp, and result.

### Q. Import, Adoption & Documentation Generator
Existing real-world setups should be movable into ServerMon.
- **Import Existing Config:** Import existing FRP and Nginx configs as unmanaged/read-only records first.
- **Adopt Managed Config:** Let users adopt imported routes into ServerMon-managed config after diff/validation.
- **Conflict Detection:** Detect duplicate domains, overlapping paths, port conflicts, unmanaged Nginx server blocks, and FRP proxy name conflicts.
- **Generated Documentation:** For every node and public route, generate a readable page showing purpose, owner, domain, target node, local port, access policy, generated config revision, health checks, logs, recent changes, and troubleshooting steps.
- **Export Docs:** Allow exporting sanitized route/client docs for runbooks or handoff.

---

## 3. Database Schema (`src/models/Node.ts`)
The `Node` model tracks the fleet state:
- `name`: string (e.g., "Home Desktop")
- `slug`: string (e.g., "orion")
- `status`: "online" | "offline" | "connecting" | "degraded" | "maintenance" | "disabled" | "unpaired" | "error"
- `tunnelStatus`: "connected" | "reconnecting" | "disconnected" | "auth_failed" | "config_invalid" | "proxy_conflict" | "unsupported_config"
- `pairingToken`: string (hashed)
- `lastSeen`: Date
- `connectedSince`: Date
- `agentVersion`: string
- `frpcVersion`: string
- `lastError`: { code, message, occurredAt, correlationId }
- `hardware`: { cpuCount, totalRam, diskSize, osDistro }
- `frpcConfig`: { protocol, tlsEnabled, transportEncryptionEnabled, compressionEnabled, heartbeatInterval, heartbeatTimeout, advanced }
- `generatedToml`: { hash, renderedAt, version }
- `proxyRules`: Array<{ name, type, subdomain, localIp, localPort, remotePort, enabled, status, lastError }>
- `publicRoutes`: Array<{ domain, path, proxyRuleName, tlsEnabled, accessMode, nginxStatus, healthStatus, lastCheckedAt, lastError }>
- `metrics`: { cpuLoad, ramUsed, uptime } (last snapshot)
- `tags`: string[]
- `maintenance`: { enabled, reason, until }
- `audit`: { createdBy, createdAt, updatedBy, updatedAt }

Additional production models:
- **`FrpServerState`**: Tracks global `frps` enabled flag, runtime state, bind ports, generated config hash, version, last restart, last error, and active connection count.
- **`FleetLogEvent`**: Stores structured logs and audit events with `nodeId`, `service`, `level`, `eventType`, `message`, `metadata`, `correlationId`, and retention metadata.
- **`ConfigRevision`**: Stores versioned generated `frps.toml` and `frpc.toml` outputs so changes can be compared, rolled back, and audited.
- **`PublicRoute`**: Tracks cloud-facing domains/path routes, target node, target proxy, Nginx config revision, TLS/certificate state, DNS verification state, access policy, health state, and last error.
- **`NginxState`**: Tracks whether Nginx management is enabled, config directory, runtime status, last `nginx -t`, last reload, managed server names, detected conflicts, and active certificate provider.
- **`AgentUpdateJob`**: Tracks update/rollback jobs, selected nodes, rollout strategy, version before/after, status, logs, failures, and initiated user.
- **`BackupJob`**: Tracks scheduled/manual backups, included scopes, destination, retention, encryption mode, status, size, and restore compatibility.
- **`ResourcePolicy`**: Stores configurable soft/hard limits globally and per node/tag/role.
- **`AccessPolicy`**: Stores reusable route access policies, temporary shares, IP allowlists, schedules, and auth requirements.
- **`RouteTemplate`**: Stores built-in and custom service publishing templates.
- **`DiagnosticRun`**: Stores client/route troubleshooting checks, evidence, results, recommended fixes, and sanitized report metadata.
- **`ImportedConfig`**: Stores discovered/imported FRP and Nginx config, adoption status, conflicts, and source paths.

## 4. UI Component Architecture (Modular Design)

To ensure high maintainability and avoid "Prop Drilling" or massive single-page files, the UI is strictly divided into functional components.

### A. Dashboard Components (`src/modules/nodes/ui/dashboard/`)
- **`NodeGrid.tsx`**: A responsive CSS grid container that handles the fetching and rendering of `NodeCard` components.
- **`NodeCard.tsx`**: Isolated component for a single Node. Contains its own polling logic (SWR) for high-frequency health updates.
- **`NodeSearch.tsx`**: Filter and search component to quickly find machines in a large fleet.
- **`FleetStatsBanner.tsx`**: Summarized stats (e.g., "12/15 Nodes Online", "Total Throughput: 4.5 MB/s").

### B. Onboarding Components (`src/modules/nodes/ui/onboarding/`)
- **`OnboardingWizard.tsx`**: Wrapper for the multi-step modal setup.
  - *Step 1: Identity:* Set machine name and tags.
  - *Step 2: DNS Guide:* Automated check/guide for setting up the wildcard DNS CNAME/A record if required for subdomains.
  - *Step 3: FRPC Settings:* Ask the user for encryption/TLS, compression, transport protocol, heartbeat/reconnect behavior, proxy types, local ports, tags, and access rules.
  - *Step 4: TOML Preview:* Live generated `frpc.toml` preview based on the selected options, with validation warnings and copy support.
  - *Step 5: Installation:* Interactive terminal snippet based on the OS (detection for Linux/Docker/Mac).
  - *Step 6: Verification:* Real-time polling to confirm the agent has established its first tunnel, registered all selected proxies, and is sending health data.
- **`InstallerSnippet.tsx`**: A library of copy-pasteable blocks for different environments (Ubuntu, CentOS, Docker, MacOS).
- **`DnsVerifier.tsx`**: A small utility within the wizard that does server-side DNS lookups to confirm the user's wildcard record is active.
- **`FrpcConfigForm.tsx`**: Structured form for FRPC transport/security/proxy options with sensible production defaults and inline validation.
- **`TomlPreview.tsx`**: Read-only generated TOML viewer with syntax highlighting, diff against previous revision, and validation errors.

### C. Detail View Components (`src/modules/nodes/ui/details/`)
- **`NodeTerminal.tsx`**: Wrapper for `xterm.js`. Manages the WebSocket connection lifecycle.
- **`NodeHardwareCharts.tsx`**: Renders time-series data using a chart library (e.g., Recharts) specifically for that node.
- **`ProxyRuleTable.tsx`**: Dedicated CRUD table for editing the reverse proxy routes.
- **`PublicRouteTable.tsx`**: Dedicated CRUD table for domains/routes that expose remote services through cloud Nginx.
- **`ExposeServiceWizard.tsx`**: End-to-end flow for selecting a remote service, choosing a domain, previewing FRP/Nginx config, validating DNS/TLS, and publishing.
- **`RemoteProcessTable.tsx`**: Fetches and displays the top processes solely from that remote agent.
- **`NodeStatusPanel.tsx`**: Shows ServerMon heartbeat, FRPC tunnel status, proxy status, last seen, connection age, versions, and actionable errors.
- **`NodeLogsView.tsx`**: Per-client logs with filters, live tail, download/export, and correlation links to config revisions or endpoint runs.

### D. Operations Components (`src/modules/nodes/ui/operations/`)
- **`FrpServerControl.tsx`**: Global `frps` on/off toggle, restart button, runtime state, active connection count, and last error.
- **`NginxManager.tsx`**: Cloud-side Nginx status, managed routes, config test output, reload controls, conflict detection, and last error.
- **`CertificateManager.tsx`**: TLS certificate status, expiry, provider, renewal logs, and domain validation.
- **`AgentUpdateCenter.tsx`**: Version inventory, one-click updates, staged rollouts, rollback controls, and update logs.
- **`BackupRestorePanel.tsx`**: Backup schedules, manual backup, restore checks, disaster recovery status, and backup health.
- **`PreflightReport.tsx`**: Hub readiness checks for ports, firewall reachability, DNS, TLS, Nginx, FRP, MongoDB, disk, and permissions.
- **`RouteTemplatePicker.tsx`**: Service catalog for common publishing templates and saved custom templates.
- **`AccessPolicyEditor.tsx`**: Public/authenticated/IP allowlist/basic auth/temporary share/scheduled access configuration.
- **`ResourceGuardSettings.tsx`**: Configurable soft/hard limits with current usage and alerts.
- **`TroubleshootingAssistant.tsx`**: Step-by-step diagnostics for clients and public routes with one-click recheck and sanitized report export.
- **`EmergencyControls.tsx`**: Break-glass controls for disabling routes, stopping sessions/jobs, revoking agents, rotating tokens, and maintenance mode.
- **`ConfigImportWizard.tsx`**: Import existing Nginx/FRP configs as unmanaged records and optionally adopt them into ServerMon management.
- **`GeneratedDocsView.tsx`**: Auto-generated per-node and per-route runbook pages.
- **`FleetLogsPage.tsx`**: Fleet-wide structured logs and audit events with filters and live tail.
- **`ConfigRevisionHistory.tsx`**: Displays generated TOML revisions, diffs, rollback options, and who changed each revision.
- **`FleetAlertsPanel.tsx`**: Shows degraded clients, failed proxies, auth failures, DNS issues, and pending restarts.

### E. State Management Strategy
- **SWR/React Query**: Each component fetches its own data based on the `nodeId`. This prevents a single parent component from having a massive state object.
- **Zustand (Optional)**: For global fleet states like "Active Node Selection" or "Fleet-wide Sidebar State".


---

## 5. Robustness & Auto-Recovery (End-to-End Management)

For this to be a production-ready management solution, it must be resilient to network drops, power outages, and service crashes.

### A. Network Resiliency
- **FRP Native Reconnect:** The `frpc` (client) is configured with `heartbeat_interval` and `heartbeat_timeout`. If the connection to the Hub drops (e.g., home Wi-Fi flickers), `frpc` will automatically attempt to reconnect indefinitely with exponential backoff.
- **TCP Keepalives:** We will enable TCP keepalives to prevent intermediate firewalls from silently dropping idle tunnels.

### B. Service Persistence
- **Daemonization:** On the Agent machine, ServerMon will be installed as a system-level service (`systemd` on Linux, `launchd` on MacOS). This ensures that if the machine reboots or the process crashes, the Agent (and its FRP tunnel) starts back up immediately without user intervention.
- **Watchdog:** The Master Hub will maintain a "State of Health" loop. If a Node hasn't checked in for > 60 seconds, it's marked as `offline` in the UI, and an alert can be triggered.

### C. Graceful Terminal Sessions
- **Session Recovery:** If a user is in a Terminal session and the network drops briefly, the `node-pty` process on the Agent stays alive. When the tunnel reconnects, the WebSocket can re-attach to the existing terminal session so the user doesn't lose their work.

### D. Stale Rule Cleanup
- If an Agent is deleted or re-installed, the Master Hub automatically flushes all associated `frps` proxy rules and dynamic DNS entries to prevent ghost traffic.
- If a public route is deleted, the Master Hub removes the associated generated Nginx config, reloads Nginx after validation, disables the matching FRP proxy if no other route uses it, and records an audit event.

---

## 6. Security & Networking

- **Wildcard DNS:** Hub requires `*.manthanby.cv` to point to its IP.
- **Nginx Ingress Management:** Local Nginx on Hub forwards managed domains to the `frps` `vhost_http_port`. ServerMon must generate, validate, reload, monitor, and roll back managed Nginx config for public remote-service routes.
- **Custom Domains:** Support both wildcard subdomains and explicit custom domains, with DNS validation before enabling a public route.
- **Encryption Defaults:** All FRP traffic is encrypted via TLS between Agent and Hub by default. The onboarding wizard must explicitly ask whether to enable FRP transport encryption, TLS, compression, and related `frpc` options, then render the resulting TOML preview before install.
- **Token Isolation:** Each Agent has a unique pairing token. If one agent is compromised, the others remain secure.
- **Token Rotation:** Support per-agent token rotation, global emergency rotation, and automatic re-rendering of affected configs.
- **Least Privilege:** Terminal access, proxy editing, global `frps` toggles, token rotation, and endpoint execution must be protected by roles/permissions.
- **Secret Handling:** Pairing tokens and auth tokens are never shown after initial creation. Store only hashes where possible and use encrypted-at-rest storage for secrets that must be retrievable by the orchestrator.
- **Config Hardening:** Generated configs should avoid exposing admin endpoints publicly, bind local services to loopback by default, and validate against unsafe wildcard or privileged port usage.
- **Ingress Hardening:** Generated Nginx routes should include safe defaults for headers, WebSocket upgrades, request size/timeouts, TLS redirects, HSTS where appropriate, and should never expose the Nginx/FRP admin surfaces publicly.
- **Rate Limiting:** Registration, pairing, terminal sessions, and API actions should be rate-limited to reduce brute force and abuse risk.
- **Certificate Management:** Production setup must document TLS certificate requirements, renewal expectations, and how the Hub verifies client/server identity.

---

## 7. Production Readiness Requirements

The module should be ready to rock on first deployment, not merely demo-ready.

### A. Day-One Setup
- Preflight checks for OS, architecture, FRP binary availability, port availability, DNS records, TLS certificates, MongoDB connectivity, write permissions, and service manager availability.
- A guided Hub setup screen that confirms `frps` bind port, HTTP/HTTPS vhost ports, wildcard domain, public URL, and reverse proxy health.
- A guided cloud ingress setup screen that confirms Nginx is installed/reachable, the managed config directory is writable, `nginx -t` works, reload permissions are available, DNS points to the Hub, and TLS issuance/renewal is configured.
- Clear generated commands for Linux systemd, macOS launchd, Docker, and Docker Compose.
- Default configs must work in a normal production deployment without hand-editing TOML.

### B. Config Lifecycle
- Store FRP config as structured data and render TOML from that source of truth.
- Store cloud ingress/Nginx route config as structured data and render Nginx snippets from that source of truth.
- Validate every config change before applying it.
- Version every generated `frps.toml`, `frpc.toml`, and managed Nginx config revision.
- Show TOML diffs before applying changes that restart services or affect traffic.
- Show Nginx config diffs before applying domain/route changes.
- Support rollback to the last known-good config.
- Apply changes with minimal disruption: reload where FRP/Nginx supports it, restart only when necessary, and show impact before action.
- Existing FRP/Nginx configs can be imported as unmanaged/read-only records and then adopted into managed config after validation.

### C. Observability & Alerts
- Dashboard surfaces online/offline counts, degraded nodes, failed proxies, auth failures, active terminals, active endpoint runs, FRP server state, and recent critical logs.
- Dashboard also surfaces public route health, Nginx state, certificate expiry, DNS issues, and route-level request failures.
- Alerts for node offline, tunnel reconnect loops, proxy conflicts, token auth failure, DNS misconfiguration, Nginx config failure, certificate expiry/renewal failure, `frps` stopped, high error rate, and log storage nearing capacity.
- Optional notification integrations later: email, Slack/Discord webhook, Telegram, or generic webhook.

### D. Reliability & Recovery
- Agents should survive reboot, network loss, Hub restart, FRP restart, DNS hiccups, and temporary certificate renewal windows.
- Hub should safely recover from process crash and reconcile actual FRP state with database state on boot.
- Hub should reconcile actual Nginx managed config, certificates, and route health with database state on boot.
- Failed agent installs should be resumable and provide exact remediation steps.
- Deleting a node should revoke credentials, stop FRP routes, remove generated Nginx routes for that node, archive logs according to retention, and remove stale configs.
- Backup/restore must be tested enough that a Hub can be restored without manually recreating agents and routes.
- Hub high availability must at least have a documented recovery mode, with optional future standby/failover design.
- Agent upgrades must support staged rollout, compatibility checks, update logs, and rollback where supported.

### E. Network & Firewall Readiness
- Hub setup must verify public reachability for HTTP/HTTPS, FRP bind ports, vhost ports, and configured TCP remote ports.
- The UI should clearly distinguish DNS, certificate, local port bind, cloud firewall, Nginx, FRP, and remote upstream failures.
- Cloud firewall/security-group guidance must show exact required protocols and ports.

### F. UX Quality Bar
- Node cards should never show vague statuses. They should show "Offline for 3m", "Auth failed", "Proxy port conflict", or "Waiting for first heartbeat".
- Every dangerous operation has a confirmation, impact summary, and audit entry.
- Every failed action includes an actionable next step.
- Empty states explain what to do next without requiring documentation.
- Loading, reconnecting, failed, partial-success, and permission-denied states must be designed explicitly.
- Common services should be publishable through templates without hiding the generated config preview.
- The troubleshooting assistant should make "why is my domain not working?" answerable from the UI.
- The documentation generator should make each node/route understandable without reading source code.

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Current)
- Create the `Node` Schema.
- Build the `Nodes` management API (CRUD).
- Design the `NodeDirectory` UI.
- Add `FrpServerState`, `FleetLogEvent`, and `ConfigRevision` models.
- Add `PublicRoute`, `NginxState`, `ResourcePolicy`, `AccessPolicy`, `RouteTemplate`, `DiagnosticRun`, `BackupJob`, `AgentUpdateJob`, and `ImportedConfig` models.
- Define status enums and status derivation rules.

### Phase 2: The Engine (FRP Wrapper)
- Build the binary downloader utility.
- Create the `FrpOrchestrator` service (spawns/kills processes).
- Implement the "Agent Mode" boot flag (`npm run start --agent`).
- Implement global `frps` on/off/restart controls.
- Implement structured config -> TOML renderer and parser validation.
- Capture `frps`/`frpc` logs into structured log storage.
- Implement managed Nginx config renderer, `nginx -t` validation, reload orchestration, and rollback.
- Implement DNS and TLS certificate verification services.
- Implement Hub preflight checks for ports, firewall reachability, service manager, permissions, disk, MongoDB, DNS, TLS, Nginx, and FRP.
- Implement backup/restore primitives and config import parsing for existing FRP/Nginx setups.

### Phase 3: The Connection
- Implement the pairing handshake protocol.
- Setup periodic health "heartbeats" over the tunnel.
- Display live metrics in the Cloud Dashboard.
- Build the end-to-end onboarding wizard with FRPC options, TOML preview, install commands, and live verification.
- Implement status reconciliation between heartbeat, FRP process state, and proxy registration.
- Build the cloud ingress setup flow for Nginx, DNS, TLS, and managed config permissions.
- Build agent version inventory, compatibility checks, update jobs, staged rollout, and rollback support.
- Build diagnostics engine for client and route troubleshooting chains.

### Phase 4: Capabilities
- Implement the WebSocket TTY bridge for the terminal.
- Build the Proxy Routing UI for subdomains.
- Build the "Expose Remote Service" flow for publishing remote local services through cloud Nginx with proper domains and TLS.
- Add route templates, custom templates, access policy editor, temporary shares, schedules, and agent capability controls.
- Enable remote Endpoint script execution.
- Build node-level logs, server-level logs, and fleet-wide audit logs.
- Build config revision history and rollback.
- Build generated node/route documentation pages and sanitized report export.

### Phase 5: Production Hardening
- Add role-based permissions for terminal, config, logs, and global service controls.
- Add token rotation and emergency revoke flows.
- Add alerting hooks and retention settings.
- Add configurable resource guards and quota dashboards.
- Add emergency controls for disabling all public routes, stopping sessions/jobs, rotating tokens, pausing updates, and fleet maintenance mode.
- Add install/reconnect/restart/delete integration tests.
- Add update/rollback, backup/restore, config import/adoption, firewall preflight, and diagnostics integration tests.
- Add operational documentation for DNS, TLS, Docker, systemd, backup/restore, and troubleshooting.

---

## 9. Acceptance Criteria

This module is production-ready only when all of the following are true:
- A new client can be added from the UI end-to-end without manually editing TOML.
- The UI explicitly asks for FRPC encryption/TLS/compression/protocol/heartbeat/proxy settings and shows the generated TOML before install.
- The Hub has a global `frps` on/off/restart control with clear service state and audit logging.
- A remote service can be exposed from the UI with a proper cloud domain, generated Nginx config, TLS validation/provisioning, DNS checks, FRP route creation, and end-to-end health verification.
- Agent versions, compatibility, staged updates, update logs, and rollback status are visible and manageable from the Hub.
- Backup/restore exists for fleet config, route config, managed Nginx config, revisions, policies, and recovery metadata.
- Hub preflight detects cloud firewall/security-group issues, blocked ports, DNS/TLS problems, and local service binding issues.
- Common remote services can be published using built-in or custom route templates.
- Public routes have configurable access policies, and agents have enforceable capability flags.
- Resource guards are configurable with soft/hard limits and visible usage.
- Client and route troubleshooting assistants show step-by-step diagnostics and actionable fixes.
- Emergency controls exist for disabling routes, stopping sessions/jobs, revoking agents, rotating tokens, and maintenance mode.
- Existing Nginx/FRP configs can be imported as unmanaged records and adopted into managed config after validation.
- Node and route documentation can be generated/exported without exposing secrets.
- Client status clearly distinguishes online, offline, connecting, degraded, auth failure, invalid config, and proxy failures.
- Public route status clearly distinguishes DNS pending, cert failure, Nginx invalid, FRP unreachable, upstream down, and active.
- Server-level, client-level, Nginx, public-route, and fleet-wide logs exist with filtering, live tail, retention, and correlation IDs.
- Config changes are validated, versioned, previewed, audited, and rollback-capable.
- Agents recover automatically after reboot, network drops, Hub restarts, and FRP restarts.
- Security defaults are production-safe: TLS on, unique tokens, no public admin endpoints, RBAC for dangerous actions, and no secrets leaked in logs.
- The first deployment includes clear preflight checks, guided setup, and actionable failure messages.
