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
- **Config Generation:** Toms/Configs are never written manually. ServerMon generates `frps.toml` (Master) and `frpc.toml` (Agent) dynamically from the database.

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
3. **UI Display:** Master shows a terminal command:
   ```bash
   curl -sL https://ultron.manthanby.cv/install-agent.sh | bash -s -- --hub-url ultron.manthanby.cv --token MY_TOKEN
   ```
4. **Agent Setup:** The script downloads ServerMon (or pulls the Docker image), detects the environment, registers the `frpc` service, and connects.
   - *Docker Alternative:* User can simply run `docker run -d --name servermon-agent ...` with the token passed as an env var.
5. **Success:** The Hub UI instantly lights up green for "Orion: Online".

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

---

## 3. Database Schema (`src/models/Node.ts`)
The `Node` model tracks the fleet state:
- `name`: string (e.g., "Home Desktop")
- `slug`: string (e.g., "orion")
- `status`: "online" | "offline" | "maintenance"
- `pairingToken`: string (hashed)
- `lastSeen`: Date
- `hardware`: { cpuCount, totalRam, diskSize, osDistro }
- `proxyRules`: Array<{ subdomain, localPort, enabled }>
- `metrics`: { cpuLoad, ramUsed, uptime } (last snapshot)

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
  - *Step 3: Installation:* Interactive terminal snippet based on the OS (detection for Linux/Docker/Mac).
  - *Step 4: Verification:* Real-time polling to confirm the agent has established its first tunnel.
- **`InstallerSnippet.tsx`**: A library of copy-pasteable blocks for different environments (Ubuntu, CentOS, Docker, MacOS).
- **`DnsVerifier.tsx`**: A small utility within the wizard that does server-side DNS lookups to confirm the user's wildcard record is active.

### C. Detail View Components (`src/modules/nodes/ui/details/`)
- **`NodeTerminal.tsx`**: Wrapper for `xterm.js`. Manages the WebSocket connection lifecycle.
- **`NodeHardwareCharts.tsx`**: Renders time-series data using a chart library (e.g., Recharts) specifically for that node.
- **`ProxyRuleTable.tsx`**: Dedicated CRUD table for editing the reverse proxy routes.
- **`RemoteProcessTable.tsx`**: Fetches and displays the top processes solely from that remote agent.

### D. State Management Strategy
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

---

## 6. Security & Networking

- **Wildcard DNS:** Hub requires `*.manthanby.cv` to point to its IP.
- **Nginx Ingress:** Local Nginx on Hub forwards `*.manthanby.cv` ports to the `frps` `vhost_http_port`.
- **Encryption:** All FRP traffic is encrypted via TLS between Agent and Hub.
- **Token Isolation:** Each Agent has a unique pairing token. If one agent is compromised, the others remain secure.

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Current)
- Resource the `Node` Schema.
- Build the `Nodes` management API (CRUD).
- Design the `NodeDirectory` UI.

### Phase 2: The Engine (FRP Wrapper)
- Build the binary downloader utility.
- Create the `FrpOrchestrator` service (spawns/kills processes).
- Implement the "Agent Mode" boot flag (`npm run start --agent`).

### Phase 3: The Connection
- Implement the pairing handshake protocol.
- Setup periodic health "heartbeats" over the tunnel.
- Display live metrics in the Cloud Dashboard.

### Phase 4: Capabilities
- Implement the WebSocket TTY bridge for the terminal.
- Build the Proxy Routing UI for subdomains.
- Enable remote Endpoint script execution.
