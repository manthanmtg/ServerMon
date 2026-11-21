export interface InstallServerMonArgs {
  mongoUri: string;
  port: number;
  skipMongo: boolean;
  allowRoot: boolean;
  installMode?: 'release' | 'source';
  versionTarget?: string;
  releaseBaseUrl?: string;
  sourceRef?: string;
  sourceDir?: string;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function shellString(value: string): string {
  return JSON.stringify(value);
}

export function buildInstallServerMonCommand(args: InstallServerMonArgs): [string, string[]] {
  if (!args.mongoUri.trim()) {
    throw new Error('MongoDB URI is required');
  }
  const installMode = args.installMode === 'source' ? 'source' : 'release';
  const sourceDir = args.sourceDir ?? '/opt/servermon-agent/source';
  const versionTarget = args.versionTarget?.trim() || 'latest';
  const releaseBaseUrl = args.releaseBaseUrl?.trim() || '';
  const sourceRef = args.sourceRef?.trim() || 'main';
  const flags = [
    '--unattended',
    '--port "$SERVERMON_INSTALL_PORT"',
    '--mongo-uri "$SERVERMON_INSTALL_MONGO_URI"',
  ];
  if (args.allowRoot) flags.push('--allow-root');
  if (args.skipMongo) flags.push('--skip-mongo');

  const installFlags = flags.join(' ');

  return [
    'bash',
    [
      '-lc',
      `set -euo pipefail
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"

INSTALL_MODE=${shellString(installMode)}
VERSION_TARGET=${shellString(versionTarget)}
RELEASE_BASE_URL=${shellString(releaseBaseUrl)}
SOURCE_REF=${shellString(sourceRef)}
SOURCE_DIR=${shellSingleQuote(sourceDir)}
REPO_URL="https://github.com/manthanmtg/ServerMon.git"
RELEASE_TMP_DIR=""

log_info() { echo "servermon-install: $1"; }
log_err() { echo "servermon-install: $1" >&2; exit 1; }

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

run_installer() {
  local mode="$1"
  shift
  SERVERMON_INSTALL_MODE="$mode" \\
  SERVERMON_VERSION_TARGET="$VERSION_TARGET" \\
  SERVERMON_RELEASE_BASE_URL="$RELEASE_BASE_URL" \\
  SERVERMON_SOURCE_REF="$SOURCE_REF" \\
  ./scripts/install.sh "$@" ${installFlags}
}

install_from_release() {
  detect_target
  local base_url asset checksum_line
  base_url="$(resolve_release_base_url)"
  asset="servermon-hub-$PLATFORM_NAME-$ARCH_NAME.tar.gz"
  RELEASE_TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$RELEASE_TMP_DIR"' EXIT

  log_info "Downloading $asset from $base_url"
  curl -fsSL "$base_url/$asset" -o "$RELEASE_TMP_DIR/$asset"
  curl -fsSL "$base_url/SHA256SUMS" -o "$RELEASE_TMP_DIR/SHA256SUMS"
  checksum_line="$RELEASE_TMP_DIR/SHA256SUM"
  grep "  $asset$" "$RELEASE_TMP_DIR/SHA256SUMS" > "$checksum_line" || log_err "Checksum missing for $asset"
  (cd "$RELEASE_TMP_DIR" && verify_checksum "$checksum_line")

  mkdir -p "$RELEASE_TMP_DIR/app"
  tar -xzf "$RELEASE_TMP_DIR/$asset" -C "$RELEASE_TMP_DIR/app" --strip-components=1
  cd "$RELEASE_TMP_DIR/app"
  run_installer release --prebuilt
}

install_from_source() {
  local work_dir
  if [ -d "$SOURCE_DIR/.git" ]; then
    work_dir="$SOURCE_DIR"
  else
    work_dir="$(dirname "$SOURCE_DIR")/servermon-source"
    if [ ! -d "$work_dir/.git" ]; then
      rm -rf "$work_dir"
      git clone "$REPO_URL" "$work_dir"
    fi
  fi

  cd "$work_dir"
  git fetch origin
  git checkout "$SOURCE_REF"
  git pull --rebase origin "$SOURCE_REF" || git pull --rebase
  run_installer source
}

case "$INSTALL_MODE" in
  release) install_from_release ;;
  source) install_from_source ;;
  *) log_err "Unsupported install mode: $INSTALL_MODE" ;;
esac`,
    ],
  ];
}

export function redactServerMonInstallText(input: string, mongoUri?: string): string {
  let out = input;
  if (mongoUri) {
    out = out.split(mongoUri).join('[redacted-mongodb-uri]');
  }
  return out.replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted-mongodb-uri]');
}
