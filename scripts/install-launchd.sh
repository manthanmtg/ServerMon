#!/usr/bin/env bash
set -euo pipefail

LABEL="com.servermon.servermon"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_USER="$(stat -f '%Su' "$REPO_DIR" 2>/dev/null || printf '%s' "${SUDO_USER:-${USER}}")"
SERVICE_USER="$DEFAULT_USER"
ENV_FILE="${REPO_DIR}/.env.local"
PLIST_PATH="/Library/LaunchDaemons/${LABEL}.plist"
LOG_DIR="/Library/Logs/ServerMon"
WRAPPER_PATH="${REPO_DIR}/scripts/servermon-launchd-wrapper.sh"
UNINSTALL="false"

usage() {
  cat <<EOF
Usage: sudo ./scripts/install-launchd.sh [OPTIONS]

Options:
  --user USER         User account that should run ServerMon
  --env-file PATH     Environment file to load before starting ServerMon
  --label LABEL       launchd label to install (default: ${LABEL})
  --uninstall         Remove the LaunchDaemon instead of installing it
  -h, --help          Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      SERVICE_USER="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --label)
      LABEL="$2"
      PLIST_PATH="/Library/LaunchDaemons/${LABEL}.plist"
      shift 2
      ;;
    --uninstall)
      UNINSTALL="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "install-launchd.sh only supports macOS." >&2
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Please run with sudo so the LaunchDaemon can be installed system-wide." >&2
  exit 1
fi

if [[ "$UNINSTALL" == "true" ]]; then
  launchctl bootout system "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "Removed ${LABEL} from launchd."
  exit 0
fi

if [[ ! -d "$REPO_DIR" ]]; then
  echo "Repository directory not found: $REPO_DIR" >&2
  exit 1
fi

if [[ ! -x "$WRAPPER_PATH" ]]; then
  echo "Wrapper script is missing or not executable: $WRAPPER_PATH" >&2
  echo "Run: chmod +x scripts/servermon-launchd-wrapper.sh" >&2
  exit 1
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "User does not exist: $SERVICE_USER" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  echo "Create it first so launchd can boot ServerMon with the right runtime config." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
touch "$LOG_DIR/servermon.out.log" "$LOG_DIR/servermon.err.log"
chown -R "$SERVICE_USER":staff "$LOG_DIR"
chmod 755 "$LOG_DIR"

cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${WRAPPER_PATH}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${REPO_DIR}</string>

  <key>UserName</key>
  <string>${SERVICE_USER}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>SERVERMON_REPO_DIR</key>
    <string>${REPO_DIR}</string>
    <key>SERVERMON_ENV_FILE</key>
    <string>${ENV_FILE}</string>
  </dict>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/servermon.out.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/servermon.err.log</string>
</dict>
</plist>
EOF

chown root:wheel "$PLIST_PATH"
chmod 644 "$PLIST_PATH"

launchctl bootout system "$PLIST_PATH" 2>/dev/null || true
launchctl bootstrap system "$PLIST_PATH"
launchctl enable "system/${LABEL}" || true
launchctl kickstart -k "system/${LABEL}" || true

echo "Installed ${LABEL} as a LaunchDaemon."
echo "ServerMon will now start at boot without waiting for user login."
echo "Status: launchctl print system/${LABEL}"
echo "Logs: ${LOG_DIR}/servermon.out.log and ${LOG_DIR}/servermon.err.log"
