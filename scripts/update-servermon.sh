#!/usr/bin/env bash

# ────────────────────────────────────────────────────────────────
#  ServerMon Updater
# ────────────────────────────────────────────────────────────────
#  Purpose:
#    Idempotent helper script to update a deployed ServerMon instance
#    from a tracked git repository and re-run the installer in
#    "upgrade" mode (`--use-existing-values`).
#
#  Typical use cases:
#    - Manual maintenance:
#        sudo /opt/servermon/scripts/update-servermon.sh
#    - Cron-based auto-updates (example: run daily at 03:15):
#        15 3 * * * root /opt/servermon/scripts/update-servermon.sh
#
#  Behaviour:
#    1. Logs all actions to a rotating log file (see LOG_FILE below).
#    2. Performs a hard reset of the git working tree (local changes
#       are discarded; this script assumes the repo is "deployment only").
#    3. Pulls the latest changes using `git pull --rebase`.
#    4. Re-runs the main installer with `--use-existing-values`, so
#       all previously configured settings (port, Mongo URI, domain,
#       SSL, etc.) are preserved.
#
#  Safety notes:
#    - This script is designed to be run as root (or via sudo) on the
#      deployment host. It should not be run inside a developer clone.
#    - Local, uncommitted changes in the repository will be LOST due
#      to `git reset --hard`. Only use this against a release clone.
#    - Make sure the path in REPO_DIR matches where the installer
#      originally deployed the source tree.
#
#  Exit codes:
#    0  - Update completed successfully
#    1+ - A failure occurred (see log file for details)
# ────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ───────────────────────────────────────────────

# Absolute path to the ServerMon git repository used for deployments.
# Default value matches the recommended install location for the
# release clone. Change this if your deployment uses a different path.
REPO_DIR="/root/repos/ServerMon"

# Log file capturing all update activity. Suitable for review and
# troubleshooting (e.g. via `tail -f`).
LOG_FILE="/var/log/servermon_update.log"

# Optional: git remote and branch to track. Adjust if you deploy from
# a non-default remote/branch (e.g. staging).
GIT_REMOTE="origin"
GIT_BRANCH="main"

# ── Helpers ─────────────────────────────────────────────────────

log() {
  # Log a message to both stdout (when run interactively) and to the
  # dedicated log file with a timestamp prefix.
  local level="$1"
  local message="$2"
  local ts
  ts="$(date +"%Y-%m-%d %H:%M:%S")"
  echo "[$ts] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() {
  log "INFO" "$1"
}

log_error() {
  log "ERROR" "$1"
}

# Ensure the log directory exists before we start appending.
mkdir -p "$(dirname "$LOG_FILE")"

log_info "────────────────────────────────────────────────────────"
log_info "ServerMon update started"

# ── Pre-flight checks ───────────────────────────────────────────

if [ "$EUID" -ne 0 ]; then
  log_error "This script must be run as root (or via sudo)."
  exit 1
fi

if [ ! -d "$REPO_DIR" ]; then
  log_error "Repository directory '$REPO_DIR' does not exist."
  exit 1
fi

if [ ! -x "$REPO_DIR/scripts/install.sh" ]; then
  log_error "Installer not found or not executable at '$REPO_DIR/scripts/install.sh'."
  log_error "Ensure this path matches your deployment layout."
  exit 1
fi

# ── Git update ─────────────────────────────────────────────────

log_info "Changing directory to '$REPO_DIR'."
cd "$REPO_DIR"

log_info "Resetting repository to a clean state (git reset --hard)."
if ! git reset --hard 2>&1 | tee -a "$LOG_FILE"; then
  log_error "git reset --hard failed. See log for details."
  exit 1
fi

log_info "Fetching latest changes from remote '$GIT_REMOTE'."
if ! git fetch "$GIT_REMOTE" 2>&1 | tee -a "$LOG_FILE"; then
  log_error "git fetch from '$GIT_REMOTE' failed."
  exit 1
fi

log_info "Checking out branch '$GIT_BRANCH'."
if ! git checkout "$GIT_BRANCH" 2>&1 | tee -a "$LOG_FILE"; then
  log_error "git checkout '$GIT_BRANCH' failed."
  exit 1
fi

log_info "Pulling latest changes with rebase (git pull --rebase)."
if ! git pull --rebase "$GIT_REMOTE" "$GIT_BRANCH" 2>&1 | tee -a "$LOG_FILE"; then
  log_error "git pull --rebase failed. Manual intervention may be required."
  exit 1
fi

# ── Run installer in upgrade mode ──────────────────────────────

log_info "Running ServerMon installer with --use-existing-values."
if ! "$REPO_DIR/scripts/install.sh" --use-existing-values 2>&1 | tee -a "$LOG_FILE"; then
  log_error "Installer exited with a non-zero status. See log for details."
  exit 1
fi

log_info "ServerMon update finished successfully."

exit 0

