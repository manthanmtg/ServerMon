#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${SERVERMON_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${SERVERMON_ENV_FILE:-${REPO_DIR}/.env.local}"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ServerMon launchd wrapper could not find env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

cd "$REPO_DIR"
exec pnpm start
