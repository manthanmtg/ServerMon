#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  ServerMon Installer
#  Supports: Ubuntu 22.04+, Debian 11+
#  Usage:    sudo ./scripts/install.sh [OPTIONS]
# ─────────────────────────────────────────────────────────
set -euo pipefail

# ── Colors ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Defaults ─────────────────────────────────────────────
INSTALL_DIR="/opt/servermon"
RELEASES_DIR="/opt/servermon-releases"
KEEP_RELEASES=2 # Number of releases to keep (can be changed here or via --keep-last-n-release)
CONFIG_DIR="/etc/servermon"
SERVICE_NAME="servermon"
SERVICE_USER="servermon"
DEFAULT_PORT=8912
DEFAULT_MONGO_URI="mongodb://localhost:27017/servermon"

APP_PORT="${DEFAULT_PORT}"
MONGO_URI="${DEFAULT_MONGO_URI}"
DOMAIN=""
SETUP_SSL="false"
SETUP_NGINX="false"
UNATTENDED="false"
UNINSTALL="false"
SKIP_MONGO_INSTALL="false"
ALLOW_ROOT="false"
USE_EXISTING="false"

# Fleet Hub Defaults
HUB_MODE="false"
HUB_PUBLIC_URL=""
HUB_AUTH_TOKEN=""
FRP_BIND_PORT=7000
FRP_VHOST_HTTP_PORT=8080
FRP_AUTH_TOKEN=""
FRP_SUBDOMAIN_HOST=""
HUB_FRP_VERSION="latest"
FLEET_ACME_EMAIL=""

# ── Helpers ──────────────────────────────────────────────
log()      { echo -e "  ${GREEN}✓${NC} $1"; }
log_info() { echo -e "  ${BLUE}→${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}!${NC} $1"; }
log_err()  { echo -e "  ${RED}✗${NC} $1"; }
step()     { echo -e "\n${BOLD}${CYAN}[$1]${NC} ${BOLD}$2${NC}"; }
divider()  { echo -e "${DIM}──────────────────────────────────────────────${NC}"; }

ensure_nginx_managed_include() {
    local managed_dir="$1"
    local include_file="/etc/nginx/conf.d/servermon-public-routes.conf"
    if [ -d /etc/nginx/conf.d ]; then
        printf "include %s/*.conf;\n" "$managed_dir" > "$include_file"
        log_info "Ensured Nginx includes ServerMon public routes from ${managed_dir}"
    fi
}

format_duration_ms() {
    local ms="$1"
    if [ "$ms" -lt 1000 ]; then
        echo "${ms}ms"
        return
    fi
    # Round to the nearest 100ms and format as seconds with one decimal place
    local total_tenths=$(( (ms + 50) / 100 ))
    local secs=$(( total_tenths / 10 ))
    local tenths=$(( total_tenths % 10 ))
    echo "${secs}.${tenths}s"
}

ask() {
    local prompt="$1" default="$2" var="$3"
    if [ "$UNATTENDED" = "true" ]; then
        eval "$var=\"$default\""
        return
    fi
    local input
    read -r -p "$(echo -e "  ${CYAN}?${NC} ${prompt} ${DIM}[${default}]${NC}: ")" input
    eval "$var=\"${input:-$default}\""
}

ask_yn() {
    local prompt="$1" default="$2" var="$3"
    if [ "$UNATTENDED" = "true" ]; then
        eval "$var=\"$default\""
        return
    fi
    local hint="y/N"
    [ "$default" = "true" ] && hint="Y/n"
    local input
    read -r -p "$(echo -e "  ${CYAN}?${NC} ${prompt} ${DIM}[${hint}]${NC}: ")" input
    input="${input:-$([ "$default" = "true" ] && echo "y" || echo "n")}"
    if [[ "$input" =~ ^[Yy] ]]; then
        eval "$var=true"
    else
        eval "$var=false"
    fi
}

banner() {
    echo ""
    echo -e "${BOLD}${BLUE}  ╔═══════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${BLUE}  ║         ServerMon Installer           ║${NC}"
    echo -e "${BOLD}${BLUE}  ║   Secure Server Monitoring Platform   ║${NC}"
    echo -e "${BOLD}${BLUE}  ╚═══════════════════════════════════════╝${NC}"
    echo ""
}

usage() {
    echo "Usage: sudo $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --port PORT          Application port (default: ${DEFAULT_PORT})"
    echo "  --mongo-uri URI      MongoDB connection string"
    echo "  --domain DOMAIN      Domain name for Nginx reverse proxy"
    echo "  --ssl                Enable SSL via Let's Encrypt (requires --domain)"
    echo "  --skip-mongo         Skip MongoDB installation (use remote MongoDB)"
    echo "  --unattended         Non-interactive mode, use defaults/flags"
    echo "  --use-existing-values Use existing config values, no prompts (upgrade shortcut)"
    echo "  --allow-root         Run service as root (not recommended)"
    echo "  --uninstall          Remove ServerMon completely"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  sudo $0"
    echo "  sudo $0 --domain mon.example.com --ssl"
    echo "  sudo $0 --mongo-uri mongodb://db.host:27017/servermon --skip-mongo"
    echo "  sudo $0 --unattended --port 9000"
    echo "  sudo $0 --use-existing-values"
    exit 0
}

# ── Argument Parsing ─────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)        APP_PORT="$2"; shift 2 ;;
        --mongo-uri)   MONGO_URI="$2"; SKIP_MONGO_INSTALL="true"; shift 2 ;;
        --domain)      DOMAIN="$2"; SETUP_NGINX="true"; shift 2 ;;
        --ssl)         SETUP_SSL="true"; shift ;;
        --skip-mongo)  SKIP_MONGO_INSTALL="true"; shift ;;
        --unattended)  UNATTENDED="true"; shift ;;
        --use-existing-values) USE_EXISTING="true"; UNATTENDED="true"; shift ;;
        --keep-last-n-release) KEEP_RELEASES="$2"; shift 2 ;;
        --allow-root)  ALLOW_ROOT="true"; shift ;;
        --uninstall)   UNINSTALL="true"; shift ;;
        -h|--help)     usage ;;
        *)             log_err "Unknown option: $1"; usage ;;
    esac
done

# ── Root Check ───────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run as root (sudo $0)${NC}"
    exit 1
fi

# ── OS Detection ─────────────────────────────────────────
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_ID="${ID}"
        OS_VERSION="${VERSION_ID}"
        OS_NAME="${PRETTY_NAME}"
    else
        OS_ID="unknown"
        OS_VERSION=""
        OS_NAME="Unknown"
    fi
    ARCH="$(uname -m)"
}

detect_os

# ── Uninstall ────────────────────────────────────────────
if [ "$UNINSTALL" = "true" ]; then
    banner
    echo -e "  ${RED}${BOLD}Uninstalling ServerMon${NC}"
    divider

    if [ "$UNATTENDED" != "true" ]; then
        local_confirm=""
        read -r -p "$(echo -e "  ${RED}?${NC} This will remove ServerMon, its config, and service. Continue? ${DIM}[y/N]${NC}: ")" local_confirm
        if [[ ! "$local_confirm" =~ ^[Yy] ]]; then
            echo "  Aborted."
            exit 0
        fi
    fi

    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload 2>/dev/null || true

    if [ -f "/etc/nginx/sites-enabled/servermon" ]; then
        rm -f /etc/nginx/sites-enabled/servermon
        rm -f /etc/nginx/sites-available/servermon
        nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
    fi

    rm -rf "$INSTALL_DIR"
    rm -rf "$CONFIG_DIR"

    if id "$SERVICE_USER" &>/dev/null; then
        userdel "$SERVICE_USER" 2>/dev/null || true
    fi

    log "ServerMon has been removed."
    log_info "MongoDB and Nginx were left untouched."
    log_info "To remove data: drop the 'servermon' database in MongoDB."
    exit 0
fi

# ── Compatibility Check ──────────────────────────────────
banner
step "0/6" "Checking system compatibility"

if [[ "$OS_ID" != "ubuntu" && "$OS_ID" != "debian" ]]; then
    log_err "Unsupported OS: ${OS_NAME}"
    log_err "This installer supports Ubuntu 22.04+ and Debian 11+."
    log_err "For other systems, install manually (see README.md)."
    exit 1
fi

log "OS: ${OS_NAME} (${ARCH})"

# Detect existing installation
EXISTING_INSTALL="false"
EXISTING_SERVERMON_REPO_DIR=""
if [ -d "$INSTALL_DIR" ] && [ -f "${CONFIG_DIR}/env" ]; then
    EXISTING_INSTALL="true"
    EXISTING_SERVERMON_REPO_DIR=$(grep "^SERVERMON_REPO_DIR=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | xargs 2>/dev/null || true)
    log_warn "Existing ServerMon installation detected — will upgrade."
fi

# Reuse existing repo dir if available and valid
if [ -n "$EXISTING_SERVERMON_REPO_DIR" ] && [ -d "$EXISTING_SERVERMON_REPO_DIR" ]; then
    SOURCE_DIR="$EXISTING_SERVERMON_REPO_DIR"
    log_info "Reusing existing repository directory for build: ${SOURCE_DIR}"
fi

# --use-existing-values: load all config from existing env file
if [ "$USE_EXISTING" = "true" ]; then
    if [ "$EXISTING_INSTALL" != "true" ]; then
        log_err "--use-existing-values requires an existing installation at ${CONFIG_DIR}/env"
        exit 1
    fi
    log_info "Loading existing configuration from ${CONFIG_DIR}/env"
    EXISTING_PORT=$(grep "^PORT=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1)
    EXISTING_MONGO=$(grep "^MONGO_URI=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1)
    if [[ "$EXISTING_MONGO" == *"MONGO_URI="* ]]; then
        EXISTING_MONGO=${EXISTING_MONGO%%MONGO_URI=*}
    fi
    EXISTING_DOMAIN=$(grep "^DOMAIN=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1 || true)
    if [ -z "$EXISTING_DOMAIN" ] && [ -f "/etc/nginx/sites-available/servermon" ]; then
        EXISTING_DOMAIN=$(grep -oP 'server_name \K[^;]*' /etc/nginx/sites-available/servermon 2>/dev/null | head -1 | xargs 2>/dev/null || echo "")
        [ "$EXISTING_DOMAIN" = "_" ] && EXISTING_DOMAIN=""
    fi
    if grep -q "^User=root" /etc/systemd/system/${SERVICE_NAME}.service 2>/dev/null; then
        EXISTING_ALLOW_ROOT="true"
    else
        EXISTING_ALLOW_ROOT="false"
    fi

    [ -n "$EXISTING_PORT" ] && APP_PORT="$EXISTING_PORT"
    [ -n "$EXISTING_MONGO" ] && MONGO_URI="$EXISTING_MONGO"
    [ -n "$EXISTING_DOMAIN" ] && DOMAIN="$EXISTING_DOMAIN"
    [ "$EXISTING_ALLOW_ROOT" = "true" ] && ALLOW_ROOT="true"

    # Load Fleet Hub values
    EXISTING_HUB_MODE=$(grep "^FLEET_HUB_ORCHESTRATORS_ENABLED=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1 || true)
    EXISTING_HUB_URL=$(grep "^FLEET_HUB_PUBLIC_URL=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1 || true)
    EXISTING_HUB_TOKEN=$(grep "^FLEET_HUB_AUTH_TOKEN=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1 || true)
    EXISTING_FRP_PORT=$(grep "^FRP_BIND_PORT=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1 || true)
    EXISTING_FRP_VHOST=$(grep "^FRP_VHOST_HTTP_PORT=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1 || true)
    EXISTING_FRP_TOKEN=$(grep "^FRP_AUTH_TOKEN=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1 || true)
    EXISTING_FRP_SUBDOMAIN=$(grep "^FRP_SUBDOMAIN_HOST=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1 || true)
    EXISTING_FRP_VERSION=$(grep "^FLEET_FRP_VERSION=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1 || true)
    EXISTING_ACME_EMAIL=$(grep "^FLEET_ACME_EMAIL=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1 || true)

    [ "$EXISTING_HUB_MODE" = "true" ] && HUB_MODE="true"
    [ -n "$EXISTING_HUB_URL" ] && HUB_PUBLIC_URL="$EXISTING_HUB_URL"
    [ -n "$EXISTING_HUB_TOKEN" ] && HUB_AUTH_TOKEN="$EXISTING_HUB_TOKEN"
    [ -n "$EXISTING_FRP_PORT" ] && FRP_BIND_PORT="$EXISTING_FRP_PORT"
    [ -n "$EXISTING_FRP_VHOST" ] && FRP_VHOST_HTTP_PORT="$EXISTING_FRP_VHOST"
    [ -n "$EXISTING_FRP_TOKEN" ] && FRP_AUTH_TOKEN="$EXISTING_FRP_TOKEN"
    [ -n "$EXISTING_FRP_SUBDOMAIN" ] && FRP_SUBDOMAIN_HOST="$EXISTING_FRP_SUBDOMAIN"
    [ -n "$EXISTING_FRP_VERSION" ] && HUB_FRP_VERSION="$EXISTING_FRP_VERSION"
    [ -n "$EXISTING_ACME_EMAIL" ] && FLEET_ACME_EMAIL="$EXISTING_ACME_EMAIL"
    
    if [[ "$MONGO_URI" != *"localhost"* && "$MONGO_URI" != *"127.0.0.1"* ]]; then
        SKIP_MONGO_INSTALL="true"
    fi
    if [ -n "$DOMAIN" ]; then
        SETUP_NGINX="true"
        # Preserve SSL setting: check if cert exists
        if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
            SETUP_SSL="true"
        fi
    elif [ -f "/etc/nginx/sites-enabled/servermon" ]; then
        SETUP_NGINX="true"
    fi
    log "Loaded existing values (port=${APP_PORT}, mongo=${MONGO_URI}, domain=${DOMAIN:-none})"
fi

# ── Interactive Configuration ────────────────────────────
if [ "$UNATTENDED" != "true" ]; then
    echo ""
    echo -e "  ${BOLD}Configure your installation:${NC}"
    divider

    if [ "$EXISTING_INSTALL" = "true" ]; then
        # Load existing config as defaults
        if [ -f "${CONFIG_DIR}/env" ]; then
            EXISTING_PORT=$(grep "^PORT=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1)
            EXISTING_MONGO=$(grep "^MONGO_URI=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1)
            # Cleanup if previously corrupted by sed bug
            if [[ "$EXISTING_MONGO" == *"MONGO_URI="* ]]; then
                EXISTING_MONGO=${EXISTING_MONGO%%MONGO_URI=*}
            fi

            EXISTING_DOMAIN=$(grep "^DOMAIN=" "${CONFIG_DIR}/env" 2>/dev/null | cut -d'=' -f2- | head -1)
            
            # If not in env file, try to extract from Nginx config
            if [ -z "$EXISTING_DOMAIN" ] && [ -f "/etc/nginx/sites-available/servermon" ]; then
                EXISTING_DOMAIN=$(grep -oP 'server_name \K[^;]*' /etc/nginx/sites-available/servermon 2>/dev/null | head -1 | xargs || echo "")
                [ "$EXISTING_DOMAIN" = "_" ] && EXISTING_DOMAIN=""
            fi

            [ -n "$EXISTING_PORT" ] && APP_PORT="$EXISTING_PORT"
            [ -n "$EXISTING_MONGO" ] && MONGO_URI="$EXISTING_MONGO"
            [ -n "$EXISTING_DOMAIN" ] && DOMAIN="$EXISTING_DOMAIN"
        fi
    fi

    ask "Application port" "$APP_PORT" "APP_PORT"
    ask "MongoDB URI" "$MONGO_URI" "MONGO_URI"

    if [[ "$MONGO_URI" != *"localhost"* && "$MONGO_URI" != *"127.0.0.1"* ]]; then
        SKIP_MONGO_INSTALL="true"
    fi

    ask "Domain name (empty for IP-only access)" "${DOMAIN:-none}" "DOMAIN"
    if [ "$DOMAIN" = "none" ]; then
        DOMAIN=""
    fi

    if [ -n "$DOMAIN" ]; then
        SETUP_NGINX="true"
        ask_yn "Set up SSL with Let's Encrypt?" "true" "SETUP_SSL"
    else
        ask_yn "Set up Nginx reverse proxy? (recommended)" "false" "SETUP_NGINX"
    fi

    if [ "$ALLOW_ROOT" = "false" ]; then
        ask_yn "Run as root? (WARNING: Not recommended for security)" "true" "ALLOW_ROOT"
    fi

    # Fleet Hub Configuration
    echo ""
    echo -e "  ${BOLD}Fleet Hub Configuration:${NC}"
    divider
    ask_yn "Enable Fleet Hub mode? (To manage remote nodes)" "$HUB_MODE" "HUB_MODE"
    if [ "$HUB_MODE" = "true" ]; then
        if [ -n "$DOMAIN" ]; then
            DEFAULT_HUB_URL="https://${DOMAIN}"
            DEFAULT_SUBDOMAIN="${DOMAIN}"
        else
            LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-ip")
            DEFAULT_HUB_URL="http://${LOCAL_IP}:${APP_PORT}"
            DEFAULT_SUBDOMAIN=""
        fi
        
        ask "Hub Public URL" "${HUB_PUBLIC_URL:-$DEFAULT_HUB_URL}" "HUB_PUBLIC_URL"
        ask "FRP Subdomain Host (e.g., example.com)" "${FRP_SUBDOMAIN_HOST:-$DEFAULT_SUBDOMAIN}" "FRP_SUBDOMAIN_HOST"
        ask "FRP Bind Port" "$FRP_BIND_PORT" "FRP_BIND_PORT"
        ask "FRP Version (e.g., 0.61.0 or 'latest')" "$HUB_FRP_VERSION" "HUB_FRP_VERSION"
        
        if [ -z "$HUB_AUTH_TOKEN" ]; then
            HUB_AUTH_TOKEN=$(openssl rand -base64 32)
            log "Generated FLEET_HUB_AUTH_TOKEN"
        fi
        if [ -z "$FRP_AUTH_TOKEN" ]; then
            FRP_AUTH_TOKEN=$(openssl rand -base64 32)
            log "Generated FRP_AUTH_TOKEN"
        fi
    fi
fi

# SSL requires domain
if [ "$SETUP_SSL" = "true" ] && [ -z "$DOMAIN" ]; then
    log_err "SSL requires a --domain. Disabling SSL."
    SETUP_SSL="false"
fi

# ── Summary ──────────────────────────────────────────────
TOTAL_STEPS=5
[ "$SETUP_NGINX" = "true" ] && TOTAL_STEPS=6

echo ""
echo -e "  ${BOLD}Installation Summary${NC}"
divider
echo -e "  Install path:   ${BOLD}${INSTALL_DIR}${NC}"
echo -e "  Port:            ${BOLD}${APP_PORT}${NC}"
echo -e "  MongoDB:         ${BOLD}${MONGO_URI}${NC}"
echo -e "  Install Mongo:   ${BOLD}$([ "$SKIP_MONGO_INSTALL" = "true" ] && echo "No (remote)" || echo "Yes (local)")${NC}"
echo -e "  Domain:          ${BOLD}${DOMAIN:-"— (IP access only)"}${NC}"
echo -e "  Nginx:           ${BOLD}$([ "$SETUP_NGINX" = "true" ] && echo "Yes" || echo "No")${NC}"
echo -e "  SSL:             ${BOLD}$([ "$SETUP_SSL" = "true" ] && echo "Yes (Let's Encrypt)" || echo "No")${NC}"
echo -e "  Run as root:     ${BOLD}$([ "$ALLOW_ROOT" = "true" ] && echo "Yes (WARNING)" || echo "No")${NC}"
echo -e "  Fleet Hub:       ${BOLD}$([ "$HUB_MODE" = "true" ] && echo "Enabled (${HUB_PUBLIC_URL})" || echo "Disabled")${NC}"
echo -e "  Mode:            ${BOLD}$([ "$EXISTING_INSTALL" = "true" ] && echo "Upgrade" || echo "Fresh install")${NC}"
divider

if [ "$UNATTENDED" != "true" ]; then
    local_confirm=""
    read -r -p "$(echo -e "  ${CYAN}?${NC} Proceed with installation? ${DIM}[Y/n]${NC}: ")" local_confirm
    if [[ "$local_confirm" =~ ^[Nn] ]]; then
        echo "  Aborted."
        exit 0
    fi
fi

echo ""

# ── Step 1: System Dependencies ──────────────────────────
step "1/${TOTAL_STEPS}" "Installing system dependencies"


log_info "Updating package lists..."
apt-get update -y || { 
    log_err "apt-get update failed."
    log_err "This is often caused by broken third-party repositories."
    log_err "Please fix your /etc/apt/sources.list.d/ items and try again."
    exit 1; 
}

log_info "Installing core packages: curl, git, build-essential, lsof, liblzma-dev, pkg-config, snapd..."
apt-get install -y curl git build-essential lsof liblzma-dev pkg-config snapd || { log_err "Failed to install system dependencies"; exit 1; }
log "Installed core build and system tools"



log "Base packages and tools installed"

# ── Step 2: Node.js & pnpm ──────────────────────────────
step "2/${TOTAL_STEPS}" "Setting up Node.js and pnpm"

if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    log "Node.js already installed: ${NODE_VER}"
else
    log_info "Setting up NodeSource repository for Node.js v20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | bash - > /dev/null 2>&1
    log_info "Installing nodejs package..."
    apt-get install -qq -y nodejs > /dev/null 2>&1
    log "Node.js $(node -v) installed"
fi

if command -v pnpm &> /dev/null; then
    log "pnpm already installed: $(pnpm -v)"
else
    log_info "Installing pnpm..."
    npm install -g pnpm > /dev/null 2>&1
    log "pnpm $(pnpm -v) installed"
fi

PNPM_PATH="$(which pnpm)"

# ── Step 3: MongoDB ──────────────────────────────────────
step "3/${TOTAL_STEPS}" "Setting up MongoDB"

if [ "$SKIP_MONGO_INSTALL" = "true" ]; then
    log "Skipping local MongoDB install (using remote: ${MONGO_URI})"
else
    if command -v mongod &> /dev/null; then
        log "MongoDB already installed"
    else
        log_info "Installing MongoDB 7.0..."
        curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc 2>/dev/null \
            | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg 2>/dev/null

        CODENAME=$(lsb_release -cs 2>/dev/null || echo "jammy")
        log_info "Detected OS codename: ${CODENAME}"
        echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${CODENAME}/mongodb-org/7.0 multiverse" \
            > /etc/apt/sources.list.d/mongodb-org-7.0.list

        apt-get update -qq -y > /dev/null 2>&1
        apt-get install -qq -y mongodb-org > /dev/null 2>&1
        log "MongoDB 7.0 installed"
    fi

    systemctl enable mongod > /dev/null 2>&1 || true
    systemctl start mongod > /dev/null 2>&1 || true

    # Verify MongoDB is running
    sleep 2
    if systemctl is-active --quiet mongod; then
        log "MongoDB is running"
    else
        log_warn "MongoDB may not be running. Check: systemctl status mongod"
    fi
fi

# ── Step 4: Application Setup ────────────────────────────
step "4/${TOTAL_STEPS}" "Building ServerMon"

# Determine source directory (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$(dirname "$SCRIPT_DIR")}"

# Prepare new release directory (build happens here to minimize downtime)
mkdir -p "$RELEASES_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
NEW_RELEASE_DIR="${RELEASES_DIR}/servermon-${TIMESTAMP}"
mkdir -p "$NEW_RELEASE_DIR"

if [ "$EXISTING_INSTALL" = "true" ]; then
    log_info "Upgrading application files into new release: ${NEW_RELEASE_DIR}"
else
    log_info "Performing fresh install into new release: ${NEW_RELEASE_DIR}"
fi

# Copy source excluding git, node_modules, .pnpm-store, .next, env files
log_info "Syncing source files to ${NEW_RELEASE_DIR}..."
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.pnpm-store' \
    --exclude='.next' --exclude='.env*' \
    "${SOURCE_DIR}/" "${NEW_RELEASE_DIR}/" 2>/dev/null || {
    # Fallback if rsync is not available
    log_warn "rsync not available, falling back to cp..."
    cp -r "${SOURCE_DIR}/." "${NEW_RELEASE_DIR}/"
    rm -rf "${NEW_RELEASE_DIR}/.git" "${NEW_RELEASE_DIR}/node_modules" "${NEW_RELEASE_DIR}/.pnpm-store" "${NEW_RELEASE_DIR}/.next"
}
log "Release source prepared"

cd "$NEW_RELEASE_DIR"

log_info "Installing dependencies..."
# Pre-approve native builds for pnpm v10+ to avoid interactive prompts
log_info "Configuring pre-approved built dependencies (lzma-native, node-pty, argon2)..."
pnpm config set only-built-dependencies --json '["lzma-native", "node-pty", "argon2"]' > /dev/null 2>&1

pnpm install --frozen-lockfile 2>&1 | tail -5 || pnpm install 2>&1 | tail -5

# Calculate optimal Node memory based on available system RAM
TOTAL_RAM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "4096")
if [ "$TOTAL_RAM_MB" -ge 8192 ]; then
    NODE_MEM=4096
elif [ "$TOTAL_RAM_MB" -ge 4096 ]; then
    NODE_MEM=3072
elif [ "$TOTAL_RAM_MB" -ge 2048 ]; then
    NODE_MEM=1536
else
    NODE_MEM=1024
fi

CPU_CORES=$(nproc 2>/dev/null || echo "2")
log_info "Building application (Node memory: ${NODE_MEM}MB, CPUs: ${CPU_CORES})..."
log_info "This may take 2-10 minutes depending on your server's CPU and RAM."

# Inject temporary environment for build time to satisfy Next.js static analysis/checks
export NODE_OPTIONS="--max-old-space-size=${NODE_MEM}"
export JWT_SECRET="${JWT_SECRET:-build_time_temporary_secret}"
export MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/servermon}"
export SERVERMON_BUILDING=1
pnpm run build 2>&1 || {
    log_err "Build failed. Check above output for errors."
    exit 1;
}
unset SERVERMON_BUILDING
log "Application built successfully"

# ── Environment Configuration ────────────────────────────
mkdir -p "$CONFIG_DIR"

if [ "$EXISTING_INSTALL" = "true" ] && [ -f "${CONFIG_DIR}/env" ]; then
    log_info "Updating environment config..."
    # Safer replacement without sed & issues
    update_env_line() {
        local key=$1
        local val=$2
        grep -v "^${key}=" "${CONFIG_DIR}/env" > "${CONFIG_DIR}/env.tmp"
        echo "${key}=${val}" >> "${CONFIG_DIR}/env.tmp"
        mv "${CONFIG_DIR}/env.tmp" "${CONFIG_DIR}/env"
    }

    update_env_line "MONGO_URI" "${MONGO_URI}"
    update_env_line "PORT" "${APP_PORT}"
    update_env_line "DOMAIN" "${DOMAIN}"
    update_env_line "SERVERMON_REPO_DIR" "${SOURCE_DIR}"

    if [ "$HUB_MODE" = "true" ]; then
        # Ensure managed directory exists for Hub snippets
        MANAGED_DIR="${FLEET_NGINX_MANAGED_DIR:-/etc/nginx/servermon}"
        if [ ! -d "$MANAGED_DIR" ]; then
            log_info "Creating Nginx managed directory: ${MANAGED_DIR}"
            mkdir -p "$MANAGED_DIR"
        fi
        if id "$SERVICE_USER" &>/dev/null; then
            chown -R "${SERVICE_USER}:${SERVICE_USER}" "$MANAGED_DIR"
        fi
        ensure_nginx_managed_include "$MANAGED_DIR"
        
        update_env_line "FLEET_HUB_ORCHESTRATORS_ENABLED" "true"
        update_env_line "FLEET_HUB_PUBLIC_URL" "${HUB_PUBLIC_URL}"
        update_env_line "FLEET_HUB_AUTH_TOKEN" "${HUB_AUTH_TOKEN}"
        update_env_line "FRP_BIND_PORT" "${FRP_BIND_PORT}"
        update_env_line "FRP_VHOST_HTTP_PORT" "${FRP_VHOST_HTTP_PORT}"
        update_env_line "FRP_AUTH_TOKEN" "${FRP_AUTH_TOKEN}"
        update_env_line "FRP_SUBDOMAIN_HOST" "${FRP_SUBDOMAIN_HOST}"
        update_env_line "FLEET_FRP_VERSION" "${HUB_FRP_VERSION}"
        [ -n "$FLEET_ACME_EMAIL" ] && update_env_line "FLEET_ACME_EMAIL" "${FLEET_ACME_EMAIL}"
    fi

    # Add JWT_SECRET if missing
    if ! grep -q "^JWT_SECRET=" "${CONFIG_DIR}/env"; then
        JWT_SECRET=$(openssl rand -base64 32)
        echo "JWT_SECRET=${JWT_SECRET}" >> "${CONFIG_DIR}/env"
    fi
    log "Environment config updated (secrets preserved)"
else
    log_info "Generating environment config..."
    JWT_SECRET=$(openssl rand -base64 32)
    cat > "${CONFIG_DIR}/env" <<ENVEOF
NODE_ENV=production
PORT=${APP_PORT}
MONGO_URI=${MONGO_URI}
JWT_SECRET=${JWT_SECRET}
DOMAIN=${DOMAIN}
SERVERMON_REPO_DIR=${SOURCE_DIR}
ENVEOF

    if [ "$HUB_MODE" = "true" ]; then
        MANAGED_DIR="${FLEET_NGINX_MANAGED_DIR:-/etc/nginx/servermon}"
        mkdir -p "$MANAGED_DIR"
        if id "$SERVICE_USER" &>/dev/null; then
            chown -R "${SERVICE_USER}:${SERVICE_USER}" "$MANAGED_DIR"
        fi
        ensure_nginx_managed_include "$MANAGED_DIR"

        cat >> "${CONFIG_DIR}/env" <<HUBEOF
FLEET_HUB_ORCHESTRATORS_ENABLED=true
FLEET_HUB_PUBLIC_URL=${HUB_PUBLIC_URL}
FLEET_HUB_AUTH_TOKEN=${HUB_AUTH_TOKEN}
FRP_BIND_PORT=${FRP_BIND_PORT}
FRP_VHOST_HTTP_PORT=${FRP_VHOST_HTTP_PORT}
FRP_AUTH_TOKEN=${FRP_AUTH_TOKEN}
FRP_SUBDOMAIN_HOST=${FRP_SUBDOMAIN_HOST}
FLEET_FRP_VERSION=${HUB_FRP_VERSION}
HUBEOF
        [ -n "$FLEET_ACME_EMAIL" ] && echo "FLEET_ACME_EMAIL=${FLEET_ACME_EMAIL}" >> "${CONFIG_DIR}/env"
    fi

    log "Environment config created at ${CONFIG_DIR}/env"
fi

chmod 600 "${CONFIG_DIR}/env"

# Create service user
if [ "$ALLOW_ROOT" = "true" ]; then
    SERVICE_USER="root"
    log_warn "Service will run as root user"
else
    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd -r -s /bin/false "$SERVICE_USER"
        log "Service user '${SERVICE_USER}' created"
    fi
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "$NEW_RELEASE_DIR"

    # Create manual cron run log directory
    CRON_LOG_DIR="/var/log/servermon_cron_manual_run"
    mkdir -p "$CRON_LOG_DIR"
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "$CRON_LOG_DIR"
    chmod 755 "$CRON_LOG_DIR"
    log "Manual cron log directory created at ${CRON_LOG_DIR}"
fi

# ── Step 5: Systemd Service ──────────────────────────────
step "5/${TOTAL_STEPS}" "Configuring systemd service"

# Ensure we always keep at least one release
if ! [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || [ "$KEEP_RELEASES" -lt 1 ]; then
    KEEP_RELEASES=1
fi

# Track downtime when we stop an already-running service
SERVICE_WAS_ACTIVE="false"
SERVICE_DOWNTIME_START_MS=""

# Stop existing service during upgrade to switch to new release
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    SERVICE_WAS_ACTIVE="true"
    SERVICE_DOWNTIME_START_MS="$(date +%s%3N)"
    log_info "Stopping existing service for upgrade..."
    systemctl stop "$SERVICE_NAME" || true
fi

# Kill stray processes on the port
if command -v lsof &> /dev/null; then
    STRAY_PID=$(lsof -t -i:"${APP_PORT}" 2>/dev/null || true)
    if [ -n "$STRAY_PID" ]; then
        log_info "Stopping process on port ${APP_PORT}..."
        kill "$STRAY_PID" 2>/dev/null || true
        sleep 1
    fi
fi

# Point the stable install directory to the new release
# Transition: if INSTALL_DIR is a real directory (legacy), move it aside
if [ -d "$INSTALL_DIR" ] && [ ! -L "$INSTALL_DIR" ]; then
    log_warn "Legacy installation detected at ${INSTALL_DIR}. Converting to symlink..."
    mv "$INSTALL_DIR" "${INSTALL_DIR}.legacy-$(date +%Y%m%d-%H%M%S)"
    log_info "Legacy directory moved to ${INSTALL_DIR}.legacy-*"
fi
ln -sfn "$NEW_RELEASE_DIR" "$INSTALL_DIR"
if [ "$ALLOW_ROOT" != "true" ] && id "$SERVICE_USER" &>/dev/null; then
    chown -h "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR" 2>/dev/null || true
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "$NEW_RELEASE_DIR"
fi
log_info "Current release linked to ${INSTALL_DIR}"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<SVCEOF
[Unit]
Description=ServerMon — Server Monitoring Platform
After=network.target$([ "$SKIP_MONGO_INSTALL" != "true" ] && echo " mongod.service")
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${CONFIG_DIR}/env
ExecStart=${PNPM_PATH} start
Restart=always
RestartSec=5
TimeoutStopSec=15
KillMode=control-group
KillSignal=SIGTERM
FinalKillSignal=SIGKILL
MemoryMax=4G
MemoryHigh=3G
StandardOutput=journal
StandardError=journal
SyslogIdentifier=servermon

[Install]
WantedBy=multi-user.target
SVCEOF

log_info "Systemd service file created at /etc/systemd/system/${SERVICE_NAME}.service"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
log_info "Enabling ${SERVICE_NAME} service..."
systemctl start "$SERVICE_NAME"
log_info "Starting ${SERVICE_NAME} service..."

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "ServerMon service is running"

    if [ "$SERVICE_WAS_ACTIVE" = "true" ] && [ -n "$SERVICE_DOWNTIME_START_MS" ]; then
        SERVICE_DOWNTIME_END_MS="$(date +%s%3N)"
        SERVICE_DOWNTIME_MS=$(( SERVICE_DOWNTIME_END_MS - SERVICE_DOWNTIME_START_MS ))
        if [ "$SERVICE_DOWNTIME_MS" -lt 0 ]; then
            SERVICE_DOWNTIME_MS=0
        fi
        SERVICE_DOWNTIME_HUMAN="$(format_duration_ms "$SERVICE_DOWNTIME_MS")"
        log_info "Service was down for ${SERVICE_DOWNTIME_HUMAN}"
    fi

    # Cleanup old releases, keeping only the most recent $KEEP_RELEASES
    if [ -d "$RELEASES_DIR" ]; then
        CURRENT_TARGET="$(readlink -f "$INSTALL_DIR" 2>/dev/null || echo "")"
        cd "$RELEASES_DIR" 2>/dev/null || true
        # List directories sorted by mtime (newest first), then drop everything after KEEP_RELEASES
        OLD_RELEASES="$(ls -1dt servermon-* 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) || true)"
        if [ -n "$OLD_RELEASES" ]; then
            log_info "Cleaning up old releases (keeping last ${KEEP_RELEASES})..."
            while IFS= read -r rel; do
                [ -z "$rel" ] && continue
                # Don't delete the directory currently in use
                if [ -n "$CURRENT_TARGET" ] && [ "$(readlink -f "$rel" 2>/dev/null || echo "")" = "$CURRENT_TARGET" ]; then
                    log_info "Skipping active release: ${rel}"
                    continue
                fi
                log_info "Deleting old release: ${rel}"
                rm -rf "$rel"
            done <<< "$OLD_RELEASES"
        fi
    fi
else
    log_warn "Service may not have started. Check: journalctl -u ${SERVICE_NAME} -f"
fi

# ── Step 6: Nginx + SSL (optional) ──────────────────────
if [ "$SETUP_NGINX" = "true" ]; then
    step "6/${TOTAL_STEPS}" "Setting up Nginx reverse proxy"

    if ! command -v nginx &> /dev/null; then
        log_info "Installing Nginx..."
        apt-get install -qq -y nginx > /dev/null 2>&1
    fi
    log "Nginx installed"

    SERVER_NAME="${DOMAIN:-_}"
    NGINX_CONF="/etc/nginx/sites-available/servermon"
    TLS_LISTEN=""
    TLS_BLOCK=""
    if [ "$SETUP_SSL" = "true" ] && [ -n "$DOMAIN" ] \
        && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] \
        && [ -f "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" ]; then
        TLS_LISTEN="    listen 443 ssl;"
        TLS_BLOCK="    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
    fi
    log_info "Creating Nginx configuration at ${NGINX_CONF}..."

    cat > "$NGINX_CONF" <<NGXEOF
    server {
    listen 80;
${TLS_LISTEN}
    server_name ${SERVER_NAME};
    client_max_body_size 2m;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Health check for monitoring tools
    location /api/health {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_read_timeout 5s;
        access_log off;
    }

    # SSE stream — disable buffering so events arrive instantly
    location /api/metrics/stream {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        chunked_transfer_encoding off;
    }

    # Everything else
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
${TLS_BLOCK}
    }
NGXEOF
    # Enable the site
    log_info "Enabling Nginx site..."
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/servermon
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

    if nginx -t > /dev/null 2>&1; then
        systemctl enable nginx > /dev/null 2>&1
        systemctl reload nginx
        log "Nginx configured and running"
    else
        log_err "Nginx configuration test failed. Check: nginx -t"
    fi

    # SSL via Certbot
    if [ "$SETUP_SSL" = "true" ] && [ -n "$DOMAIN" ]; then
        log_info "Setting up SSL certificate..."

        if ! command -v certbot &> /dev/null; then
            apt-get install -qq -y certbot python3-certbot-nginx > /dev/null 2>&1
        fi

        log_info "Attempting to obtain SSL certificate for ${DOMAIN}..."

        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
            --redirect --register-unsafely-without-email 2>/dev/null && {
            log "SSL certificate installed for ${DOMAIN}"
        } || {
            log_warn "Certbot failed. You can retry later with:"
            log_warn "  certbot --nginx -d ${DOMAIN}"
        }
    fi
fi

# ── Done ─────────────────────────────────────────────────
echo ""
divider
echo ""
echo -e "  ${GREEN}${BOLD}ServerMon is ready!${NC}"
echo ""

if [ "$SETUP_SSL" = "true" ] && [ -n "$DOMAIN" ]; then
    echo -e "  URL:      ${BOLD}https://${DOMAIN}${NC}"
elif [ "$SETUP_NGINX" = "true" ] && [ -n "$DOMAIN" ]; then
    echo -e "  URL:      ${BOLD}http://${DOMAIN}${NC}"
else
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")
    echo -e "  URL:      ${BOLD}http://${LOCAL_IP}:${APP_PORT}${NC}"
fi

if [ "$HUB_MODE" = "true" ]; then
    echo ""
    echo -e "  ${CYAN}${BOLD}Fleet Hub Post-Install:${NC}"
    echo -e "  1. Visit: ${BOLD}${HUB_PUBLIC_URL}/fleet/setup${NC}"
    echo -e "  2. Run the Ingress Wizard to verify DNS and ports."
    echo -e "  3. Go to /fleet/nodes/new to onboard your first agent."
fi

echo ""
echo -e "  ${DIM}Useful commands:${NC}"
echo -e "  ${DIM}  Status:   systemctl status ${SERVICE_NAME}${NC}"
echo -e "  ${DIM}  Logs:     journalctl -u ${SERVICE_NAME} -f${NC}"
echo -e "  ${DIM}  Restart:  systemctl restart ${SERVICE_NAME}${NC}"
echo -e "  ${DIM}  Config:   ${CONFIG_DIR}/env${NC}"
echo -e "  ${DIM}  Uninstall: sudo $0 --uninstall${NC}"
echo ""
divider
