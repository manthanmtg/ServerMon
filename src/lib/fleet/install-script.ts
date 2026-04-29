export type InstallerKind = 'linux' | 'docker' | 'macos';

export interface InstallSnippetInput {
  kind: InstallerKind;
  hubUrl: string;
  token: string;
  nodeId: string;
  agentImage?: string;
  installerBaseUrl?: string;
  installMode?: 'release' | 'source';
  releaseChannel?: 'latest' | 'version';
  versionTarget?: string;
  releaseBaseUrl?: string;
  sourceRef?: string;
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
  const extraArgs: string[] = [];
  if (i.kind !== 'docker') {
    if (i.installMode === 'source') {
      extraArgs.push('--build-from-source');
      if (i.sourceRef) extraArgs.push('--source-ref', shellEscape(i.sourceRef));
    } else {
      if (i.releaseChannel === 'version' && i.versionTarget) {
        extraArgs.push('--version', i.versionTarget);
      } else if (i.releaseChannel === 'latest') {
        extraArgs.push('--release', 'latest');
      }
      if (i.releaseBaseUrl) {
        extraArgs.push('--release-base-url', shellEscape(i.releaseBaseUrl));
      }
    }
  }
  const suffix = extraArgs.length ? ` ${extraArgs.join(' ')}` : '';

  if (i.kind === 'linux') {
    return `curl -sL ${base}/api/fleet/public/install-script | bash -s -- --hub-url ${hubArg} --token ${tokenArg} --node-id ${nodeArg}${suffix}`;
  }
  if (i.kind === 'macos') {
    return `curl -sL ${base}/api/fleet/public/install-script | bash -s -- --hub-url ${hubArg} --token ${tokenArg} --node-id ${nodeArg} --platform macos${suffix}`;
  }
  if (i.kind === 'docker') {
    const image = i.agentImage ?? 'servermon/agent:latest';
    return `docker run -d --name servermon-agent --restart unless-stopped -e PORT=8918 -e FLEET_AGENT_PTY_PORT=8918 -e FLEET_HUB_URL=${hubArg} -e FLEET_PAIRING_TOKEN=${tokenArg} -e FLEET_NODE_ID=${nodeArg} ${image}`;
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
PLATFORM=""
INSTALL_DIR="/opt/servermon-agent"
APP_DIR="$INSTALL_DIR/source"
METADATA_DIR="/etc/servermon-agent"
METADATA_FILE="$METADATA_DIR/install.env"
INSTALL_MODE="release"
VERSION_TARGET="latest"
RELEASE_BASE_URL=""
SOURCE_REF="main"
REPO_URL="https://github.com/manthanmtg/ServerMon.git"

if [ "$EUID" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

# ── Helpers ──────────────────────────────────────────────
log() { echo -e "  \\033[0;32m✓\\033[0m $1"; }
log_info() { echo -e "  \\033[0;34m→\\033[0m $1"; }
log_warn() { echo -e "  \\033[0;33m!\\033[0m $1"; }
log_err() { echo -e "  \\033[0;31m✗\\033[0m $1"; exit 1; }

usage() {
  cat <<EOF
Usage: install-servermon-agent.sh --hub-url URL --token TOKEN --node-id NODE [OPTIONS]

Options:
  --release [latest|vX.Y.Z] Install from GitHub release artifacts (default: latest)
  --version vX.Y.Z          Install a pinned release artifact
  --release-base-url URL    Download artifacts from a custom release asset base URL
  --build-from-source       Clone/pull the repository, install dependencies, and run pnpm build
  --source-ref REF          Source branch/tag/ref for --build-from-source (default: main)
  --platform linux|macos    Override OS detection
  --install-dir DIR         Agent install directory (default: /opt/servermon-agent)
  -h, --help                Show this help
EOF
}

# ── Argument Parsing ─────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hub-url) HUB_URL="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --node-id) NODE_ID="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; APP_DIR="$INSTALL_DIR/source"; shift 2 ;;
    --release)
      INSTALL_MODE="release"
      if [ $# -gt 1 ] && [[ "$2" != --* ]]; then VERSION_TARGET="$2"; shift 2; else shift; fi
      ;;
    --version) INSTALL_MODE="release"; VERSION_TARGET="$2"; shift 2 ;;
    --release-base-url) RELEASE_BASE_URL="$2"; shift 2 ;;
    --build-from-source) INSTALL_MODE="source"; shift ;;
    --source-ref) SOURCE_REF="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) log_err "Unknown option: $1" ;;
  esac
done

if [ -z "$HUB_URL" ] || [ -z "$TOKEN" ] || [ -z "$NODE_ID" ]; then
  log_err "Missing required arguments: --hub-url, --token, and --node-id are mandatory."
fi

if [[ ! "$HUB_URL" =~ ^http ]]; then
  SVC_HUB_URL="https://$HUB_URL"
else
  SVC_HUB_URL="$HUB_URL"
fi

detect_target() {
  local os_name
  os_name="$(uname -s)"
  case "$PLATFORM" in
    linux) PLATFORM_NAME="linux" ;;
    macos|darwin) PLATFORM_NAME="darwin" ;;
    "")
      case "$os_name" in
        Linux) PLATFORM_NAME="linux" ;;
        Darwin) PLATFORM_NAME="darwin" ;;
        *) log_err "Unsupported OS: $os_name" ;;
      esac
      ;;
    *) log_err "Unsupported platform: $PLATFORM" ;;
  esac

  local arch_name
  arch_name="$(uname -m)"
  case "$arch_name" in
    x86_64|amd64) ARCH_NAME="x64" ;;
    aarch64|arm64) ARCH_NAME="arm64" ;;
    *) log_err "Unsupported architecture: $arch_name" ;;
  esac
}

resolve_release_base_url() {
  if [ -n "$RELEASE_BASE_URL" ]; then
    echo "$RELEASE_BASE_URL"
    return
  fi
  if [ "$VERSION_TARGET" = "latest" ]; then
    echo "https://github.com/manthanmtg/ServerMon/releases/latest/download"
  else
    echo "https://github.com/manthanmtg/ServerMon/releases/download/$VERSION_TARGET"
  fi
}

verify_checksum() {
  local checksum_file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$checksum_file"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "$checksum_file"
  else
    log_err "Neither sha256sum nor shasum is available"
  fi
}

ensure_core_tools() {
  detect_target
  if [ "$PLATFORM_NAME" = "linux" ]; then
    log_info "Installing core packages..."
    $SUDO apt-get update -y >/dev/null
    $SUDO apt-get install -y curl git tar >/dev/null
  else
    for tool in curl git tar; do
      command -v "$tool" >/dev/null 2>&1 || log_err "$tool is required on macOS"
    done
  fi
}

ensure_node_pnpm() {
  if ! command -v node >/dev/null 2>&1; then
    if [ "$PLATFORM_NAME" = "linux" ]; then
      log_info "Node.js not found. Installing Node.js..."
      $SUDO apt-get install -y nodejs npm || {
        if [ -n "$SUDO" ]; then
          curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
        else
          curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        fi
        $SUDO apt-get install -y nodejs
      }
    elif command -v brew >/dev/null 2>&1; then
      log_info "Node.js not found. Installing Node.js with Homebrew..."
      brew install node
    else
      log_err "Node.js is required. Install Node.js 20+ and re-run this installer."
    fi
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    log_info "pnpm not found. Installing pnpm..."
    $SUDO npm install -g pnpm >/dev/null
  fi
  PNPM_BIN="$(command -v pnpm)"
}

write_install_metadata() {
  local mode="$1"
  $SUDO mkdir -p "$METADATA_DIR"
  cat <<METAEOF | $SUDO tee "$METADATA_FILE" >/dev/null
SERVERMON_AGENT_INSTALL_MODE=$mode
SERVERMON_AGENT_VERSION_TARGET=$VERSION_TARGET
SERVERMON_AGENT_RELEASE_BASE_URL=$RELEASE_BASE_URL
SERVERMON_AGENT_SOURCE_REF=$SOURCE_REF
SERVERMON_AGENT_APP_DIR=$APP_DIR
METAEOF
}

install_from_release() {
  local base_url asset tmp_dir checksum_line
  base_url="$(resolve_release_base_url)"
  asset="servermon-agent-$PLATFORM_NAME-$ARCH_NAME.tar.gz"
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  log_info "Downloading $asset from $base_url"
  curl -fsSL "$base_url/$asset" -o "$tmp_dir/$asset"
  curl -fsSL "$base_url/SHA256SUMS" -o "$tmp_dir/SHA256SUMS"
  checksum_line="$tmp_dir/SHA256SUM"
  grep "  $asset$" "$tmp_dir/SHA256SUMS" > "$checksum_line" || log_err "Checksum missing for $asset"
  (cd "$tmp_dir" && verify_checksum "$checksum_line")

  $SUDO rm -rf "$APP_DIR.next"
  $SUDO mkdir -p "$INSTALL_DIR" "$APP_DIR.next"
  $SUDO tar -xzf "$tmp_dir/$asset" -C "$APP_DIR.next" --strip-components=1
  $SUDO rm -rf "$APP_DIR.previous"
  if [ -e "$APP_DIR" ]; then
    $SUDO mv "$APP_DIR" "$APP_DIR.previous"
  fi
  $SUDO mv "$APP_DIR.next" "$APP_DIR"
  write_install_metadata "release"
}

install_from_source() {
  log_warn "Building from source may require significant RAM on small devices."
  $SUDO mkdir -p "$INSTALL_DIR"
  if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR"
    $SUDO git fetch origin
  else
    $SUDO rm -rf "$APP_DIR"
    $SUDO git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
  fi
  $SUDO git checkout "$SOURCE_REF"
  $SUDO git pull --rebase origin "$SOURCE_REF" || $SUDO git pull --rebase
  $SUDO pnpm install --frozen-lockfile
  $SUDO pnpm build
  write_install_metadata "source"
}

configure_systemd() {
  log_info "Configuring systemd service..."
  cat <<EOF | $SUDO tee /etc/systemd/system/servermon-agent.service >/dev/null
[Unit]
Description=ServerMon Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=8918
Environment=FLEET_AGENT_MODE=true
Environment=FLEET_AGENT_PTY_PORT=8918
Environment=FLEET_AGENT_HUB_URL=$SVC_HUB_URL
Environment=FLEET_AGENT_PAIRING_TOKEN=$TOKEN
Environment=FLEET_AGENT_NODE_ID=$NODE_ID
ExecStart=$PNPM_BIN start
Restart=always
RestartSec=10
TimeoutStopSec=15
KillMode=control-group
KillSignal=SIGTERM
FinalKillSignal=SIGKILL

[Install]
WantedBy=multi-user.target
EOF

  $SUDO systemctl daemon-reload
  $SUDO systemctl enable servermon-agent
  $SUDO systemctl restart servermon-agent
}

configure_launchd() {
  local plist="/Library/LaunchDaemons/com.servermon.agent.plist"
  log_info "Configuring launchd service..."
  cat <<EOF | $SUDO tee "$plist" >/dev/null
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.servermon.agent</string>
  <key>ProgramArguments</key>
  <array><string>$PNPM_BIN</string><string>start</string></array>
  <key>WorkingDirectory</key><string>$APP_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key><string>production</string>
    <key>PORT</key><string>8918</string>
    <key>FLEET_AGENT_MODE</key><string>true</string>
    <key>FLEET_AGENT_PTY_PORT</key><string>8918</string>
    <key>FLEET_AGENT_HUB_URL</key><string>$SVC_HUB_URL</string>
    <key>FLEET_AGENT_PAIRING_TOKEN</key><string>$TOKEN</string>
    <key>FLEET_AGENT_NODE_ID</key><string>$NODE_ID</string>
  </dict>
  <key>StandardOutPath</key><string>/var/log/servermon-agent.out.log</string>
  <key>StandardErrorPath</key><string>/var/log/servermon-agent.err.log</string>
</dict>
</plist>
EOF
  $SUDO chown root:wheel "$plist"
  $SUDO chmod 644 "$plist"
  $SUDO launchctl bootout system "$plist" 2>/dev/null || true
  $SUDO launchctl bootstrap system "$plist"
  $SUDO launchctl kickstart -k system/com.servermon.agent || true
}

ensure_core_tools
ensure_node_pnpm

log_info "Installing ServerMon Agent in $INSTALL_MODE mode..."
case "$INSTALL_MODE" in
  release) install_from_release ;;
  source) install_from_source ;;
  *) log_err "Unsupported install mode: $INSTALL_MODE" ;;
esac

if [ "$PLATFORM_NAME" = "linux" ]; then
  configure_systemd
else
  configure_launchd
fi

log "ServerMon Agent installed and started successfully!"
if [ "$PLATFORM_NAME" = "linux" ]; then
  log_info "You can check logs with: journalctl -u servermon-agent -f"
else
  log_info "You can check status with: launchctl print system/com.servermon.agent"
fi
`;
