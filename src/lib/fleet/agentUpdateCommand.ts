export type AgentUpdateMode = 'auto' | 'release' | 'source';

export interface AgentUpdateShellOptions {
  mode?: AgentUpdateMode;
  versionTarget?: string;
  releaseBaseUrl?: string;
  sourceRef?: string;
  installDir?: string;
  appDir?: string;
  serviceName?: string;
}

const DEFAULT_INSTALL_DIR = '/opt/servermon-agent';
const DEFAULT_APP_DIR = '/opt/servermon-agent/source';
const DEFAULT_SERVICE_NAME = 'servermon-agent.service';
const DEFAULT_SOURCE_REF = 'main';

function shellString(value: string): string {
  return JSON.stringify(value);
}

function normalizeMode(value: unknown): AgentUpdateMode {
  return value === 'release' || value === 'source' || value === 'auto' ? value : 'auto';
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseAgentUpdateShellOptions(args: unknown): AgentUpdateShellOptions {
  if (!args || typeof args !== 'object') return {};
  const input = args as Record<string, unknown>;
  const versionTarget = normalizeString(input.versionTarget ?? input.version);
  const releaseBaseUrl = normalizeString(input.releaseBaseUrl);
  const sourceRef = normalizeString(input.sourceRef);
  const explicitMode = input.mode ?? input.installMode ?? input.updateMode;
  return {
    mode:
      explicitMode === undefined && (versionTarget || releaseBaseUrl)
        ? 'release'
        : normalizeMode(explicitMode),
    versionTarget,
    releaseBaseUrl,
    sourceRef,
  };
}

export function buildAgentUpdateShell(options: AgentUpdateShellOptions = {}): string {
  const requestedMode = options.mode ?? 'auto';
  const requestedVersion = options.versionTarget ?? '';
  const requestedReleaseBaseUrl = options.releaseBaseUrl ?? '';
  const requestedSourceRef = options.sourceRef ?? '';
  const installDir = options.installDir ?? DEFAULT_INSTALL_DIR;
  const appDir = options.appDir ?? DEFAULT_APP_DIR;
  const serviceName = options.serviceName ?? DEFAULT_SERVICE_NAME;

  return `set -euo pipefail
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"

INSTALL_DIR=${shellString(installDir)}
APP_DIR=${shellString(appDir)}
METADATA_DIR="/etc/servermon-agent"
METADATA_FILE="$METADATA_DIR/install.env"
SERVICE_NAME=${shellString(serviceName)}
UPDATE_MODE=${shellString(requestedMode)}
REQUESTED_VERSION_TARGET=${shellString(requestedVersion)}
REQUESTED_RELEASE_BASE_URL=${shellString(requestedReleaseBaseUrl)}
REQUESTED_SOURCE_REF=${shellString(requestedSourceRef)}
SERVERMON_AGENT_INSTALL_MODE=""
SERVERMON_AGENT_VERSION_TARGET=""
SERVERMON_AGENT_RELEASE_BASE_URL=""
SERVERMON_AGENT_SOURCE_REF=""

log_info() { echo "servermon-agent-update: $1"; }
log_err() { echo "servermon-agent-update: $1" >&2; exit 1; }

if [ -f "$METADATA_FILE" ]; then
  # shellcheck source=/dev/null
  . "$METADATA_FILE"
fi

if [ "$UPDATE_MODE" = "auto" ]; then
  if [ -n "$SERVERMON_AGENT_INSTALL_MODE" ]; then
    UPDATE_MODE="$SERVERMON_AGENT_INSTALL_MODE"
  else
    UPDATE_MODE="source"
  fi
fi

VERSION_TARGET=${shellString(requestedVersion || 'latest')}
if [ -z "$REQUESTED_VERSION_TARGET" ] && [ -n "$SERVERMON_AGENT_VERSION_TARGET" ]; then
  VERSION_TARGET="$SERVERMON_AGENT_VERSION_TARGET"
fi

RELEASE_BASE_URL="$SERVERMON_AGENT_RELEASE_BASE_URL"
if [ -n "$REQUESTED_RELEASE_BASE_URL" ]; then
  RELEASE_BASE_URL="$REQUESTED_RELEASE_BASE_URL"
fi

SOURCE_REF="$SERVERMON_AGENT_SOURCE_REF"
if [ -z "$SOURCE_REF" ]; then
  SOURCE_REF=${shellString(DEFAULT_SOURCE_REF)}
fi
if [ -n "$REQUESTED_SOURCE_REF" ]; then
  SOURCE_REF="$REQUESTED_SOURCE_REF"
fi

detect_target() {
  local os_name
  os_name="$(uname -s)"
  case "$os_name" in
    Linux) PLATFORM_NAME="linux" ;;
    Darwin) PLATFORM_NAME="darwin" ;;
    *) log_err "Unsupported OS: $os_name" ;;
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

write_install_metadata() {
  local mode="$1"
  mkdir -p "$METADATA_DIR"
  cat > "$METADATA_FILE" <<METAEOF
SERVERMON_AGENT_INSTALL_MODE=$mode
SERVERMON_AGENT_VERSION_TARGET=$VERSION_TARGET
SERVERMON_AGENT_RELEASE_BASE_URL=$RELEASE_BASE_URL
SERVERMON_AGENT_SOURCE_REF=$SOURCE_REF
SERVERMON_AGENT_APP_DIR=$APP_DIR
METAEOF
}

install_from_release() {
  detect_target
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

  rm -rf "$APP_DIR.next"
  mkdir -p "$INSTALL_DIR" "$APP_DIR.next"
  tar -xzf "$tmp_dir/$asset" -C "$APP_DIR.next" --strip-components=1
  rm -rf "$APP_DIR.previous"
  if [ -e "$APP_DIR" ]; then
    mv "$APP_DIR" "$APP_DIR.previous"
  fi
  mv "$APP_DIR.next" "$APP_DIR"
  write_install_metadata "release"
}

install_from_source() {
  if [ ! -d "$APP_DIR/.git" ]; then
    log_err "Source update requested, but $APP_DIR is not a git checkout. Reinstall with --build-from-source or switch to release mode."
  fi
  cd "$APP_DIR"
  git fetch origin
  git checkout "$SOURCE_REF"
  git pull --rebase origin "$SOURCE_REF" || git pull --rebase
  pnpm install --frozen-lockfile
  pnpm build
  write_install_metadata "source"
}

case "$UPDATE_MODE" in
  release) install_from_release ;;
  source) install_from_source ;;
  *) log_err "Unsupported update mode: $UPDATE_MODE" ;;
esac

systemctl restart ${serviceName}
systemctl is-active --quiet ${serviceName}
`;
}
