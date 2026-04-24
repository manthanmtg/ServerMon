export type InstallerKind = 'linux' | 'docker' | 'macos';

export interface InstallSnippetInput {
  kind: InstallerKind;
  hubUrl: string;
  token: string;
  nodeId: string;
  agentImage?: string;
  installerBaseUrl?: string;
}

function shellEscape(value: string): string {
  // Wrap in single quotes, escape inner single quotes via '"'"'
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function renderInstallSnippet(i: InstallSnippetInput): string {
  // If hubUrl starts with http/https, use it as is, otherwise prepend https://
  const hubBase = i.hubUrl.startsWith('http') ? i.hubUrl : `https://${i.hubUrl}`;
  const base = i.installerBaseUrl ?? hubBase;
  
  // For the --hub-url argument, we want the protocol-less version if possible
  // or the full one if that's what was provided.
  const hubArg = shellEscape(i.hubUrl);
  const tokenArg = shellEscape(i.token);
  const nodeArg = shellEscape(i.nodeId);

  if (i.kind === 'linux') {
    return `curl -sL ${base}/api/fleet/public/install-script | bash -s -- --hub-url ${hubArg} --token ${tokenArg} --node-id ${nodeArg}`;
  }
  if (i.kind === 'macos') {
    return `curl -sL ${base}/api/fleet/public/install-script | bash -s -- --hub-url ${hubArg} --token ${tokenArg} --node-id ${nodeArg} --platform macos`;
  }
  if (i.kind === 'docker') {
    const image = i.agentImage ?? 'servermon/agent:latest';
    return `docker run -d --name servermon-agent --restart unless-stopped -e FLEET_HUB_URL=${hubArg} -e FLEET_PAIRING_TOKEN=${tokenArg} -e FLEET_NODE_ID=${nodeArg} ${image}`;
  }
  throw new Error(`Unknown installer kind: ${String(i.kind)}`);
}

export const AGENT_INSTALLER_BASH = `#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  ServerMon Agent Installer
# ─────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ─────────────────────────────────────────────
HUB_URL=""
TOKEN=""
NODE_ID=""
PLATFORM="linux"
INSTALL_DIR="/opt/servermon-agent"
BINARY_URL_BASE="https://github.com/manthanmtg/ServerMon/releases/latest/download"

# ── Helpers ──────────────────────────────────────────────
log() { echo -e "  \\033[0;32m✓\\033[0m $1"; }
log_info() { echo -e "  \\033[0;34m→\\033[0m $1"; }
log_err() { echo -e "  \\033[0;31m✗\\033[0m $1"; exit 1; }

# ── Argument Parsing ─────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hub-url) HUB_URL="$2"; shift 2 ;;
    --token)   TOKEN="$2"; shift 2 ;;
    --node-id) NODE_ID="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$HUB_URL" ] || [ -z "$TOKEN" ] || [ -z "$NODE_ID" ]; then
  log_err "Missing required arguments: --hub-url, --token, and --node-id are mandatory."
fi

# ── Environment Detection ────────────────────────────────
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  TRIPLE="linux_amd64" ;;
  aarch64) TRIPLE="linux_arm64" ;;
  arm64)   TRIPLE="linux_arm64" ;;
  *)       log_err "Unsupported architecture: $ARCH" ;;
esac

# ── Installation ─────────────────────────────────────────
log_info "Installing ServerMon Agent for $TRIPLE..."
sudo mkdir -p "$INSTALL_DIR"

# For now, we use the main ServerMon binary in agent mode
# In a real production scenario, you would download a dedicated agent binary
# But since ServerMon is a monolith, we can use the same binary with FLEET_AGENT_MODE=true

if ! command -v node &> /dev/null; then
  log_info "Installing Node.js 20..."
  curl -fsSL https://deb.nodejsource.com/setup_20.x | sudo bash -
  sudo apt-get install -y nodejs
fi

log_info "Downloading ServerMon agent..."
# NOTE: This part assumes you have a compiled binary or we use pnpm to run from source
# For this prototype, we'll assume the user has pnpm and we clone/install
if ! command -v pnpm &> /dev/null; then
  sudo npm install -g pnpm
fi

sudo git clone https://github.com/manthanmtg/ServerMon.git "$INSTALL_DIR/source" || {
  cd "$INSTALL_DIR/source" && sudo git pull
}

cd "$INSTALL_DIR/source"
sudo pnpm install --frozen-lockfile
sudo pnpm build

# ── Service Configuration ────────────────────────────────
log_info "Configuring systemd service..."
cat <<EOF | sudo tee /etc/systemd/system/servermon-agent.service
[Unit]
Description=ServerMon Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/source
Environment=NODE_ENV=production
Environment=FLEET_AGENT_MODE=true
Environment=FLEET_AGENT_HUB_URL=$HUB_URL
Environment=FLEET_AGENT_PAIRING_TOKEN=$TOKEN
Environment=FLEET_AGENT_NODE_ID=$NODE_ID
ExecStart=$(which pnpm) start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable servermon-agent
sudo systemctl restart servermon-agent

log "ServerMon Agent installed and started successfully!"
log_info "You can check logs with: journalctl -u servermon-agent -f"
`;
