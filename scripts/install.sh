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

# ── Helpers ──────────────────────────────────────────────
log()      { echo -e "  ${GREEN}✓${NC} $1"; }
log_info() { echo -e "  ${BLUE}→${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}!${NC} $1"; }
log_err()  { echo -e "  ${RED}✗${NC} $1"; }
step()     { echo -e "\n${BOLD}${CYAN}[$1]${NC} ${BOLD}$2${NC}"; }
divider()  { echo -e "${DIM}──────────────────────────────────────────────${NC}"; }

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
    echo "  --uninstall          Remove ServerMon completely"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  sudo $0"
    echo "  sudo $0 --domain mon.example.com --ssl"
    echo "  sudo $0 --mongo-uri mongodb://db.host:27017/servermon --skip-mongo"
    echo "  sudo $0 --unattended --port 9000"
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
if [ -d "$INSTALL_DIR" ] && [ -f "${CONFIG_DIR}/env" ]; then
    EXISTING_INSTALL="true"
    log_warn "Existing ServerMon installation detected — will upgrade."
fi

# ── Interactive Configuration ────────────────────────────
if [ "$UNATTENDED" != "true" ]; then
    echo ""
    echo -e "  ${BOLD}Configure your installation:${NC}"
    divider

    if [ "$EXISTING_INSTALL" = "true" ]; then
        # Load existing config as defaults
        if [ -f "${CONFIG_DIR}/env" ]; then
            EXISTING_PORT=$(grep -oP 'PORT=\K.*' "${CONFIG_DIR}/env" 2>/dev/null || echo "$DEFAULT_PORT")
            EXISTING_MONGO=$(grep -oP 'MONGO_URI=\K.*' "${CONFIG_DIR}/env" 2>/dev/null || echo "$DEFAULT_MONGO_URI")
            [ -n "$EXISTING_PORT" ] && APP_PORT="$EXISTING_PORT"
            [ -n "$EXISTING_MONGO" ] && MONGO_URI="$EXISTING_MONGO"
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
        ask_yn "Set up SSL with Let's Encrypt?" "false" "SETUP_SSL"
    else
        ask_yn "Set up Nginx reverse proxy? (recommended)" "false" "SETUP_NGINX"
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
apt-get update -qq -y > /dev/null 2>&1
apt-get install -qq -y curl git build-essential lsof > /dev/null 2>&1
log "Base packages installed"

# ── Step 2: Node.js & pnpm ──────────────────────────────
step "2/${TOTAL_STEPS}" "Setting up Node.js and pnpm"

if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    log "Node.js already installed: ${NODE_VER}"
else
    log_info "Installing Node.js v20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | bash - > /dev/null 2>&1
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

# Stop existing service during upgrade
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
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

# Determine source directory (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

# Copy application files
if [ "$EXISTING_INSTALL" = "true" ]; then
    log_info "Upgrading application files..."
    # Preserve .env and config
    find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name ".env" ! -name "node_modules" -exec rm -rf {} +
else
    mkdir -p "$INSTALL_DIR"
fi

# Copy source excluding git, node_modules, .pnpm-store, .next
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.pnpm-store' \
    --exclude='.next' --exclude='.env*' \
    "${SOURCE_DIR}/" "${INSTALL_DIR}/" 2>/dev/null || {
    # Fallback if rsync is not available
    cp -r "${SOURCE_DIR}/." "${INSTALL_DIR}/"
    rm -rf "${INSTALL_DIR}/.git" "${INSTALL_DIR}/node_modules" "${INSTALL_DIR}/.pnpm-store" "${INSTALL_DIR}/.next"
}

cd "$INSTALL_DIR"

log_info "Installing dependencies..."
pnpm install --frozen-lockfile > /dev/null 2>&1 || pnpm install > /dev/null 2>&1

log_info "Building application..."
pnpm run build > /dev/null 2>&1
log "Application built successfully"

# ── Environment Configuration ────────────────────────────
mkdir -p "$CONFIG_DIR"

if [ "$EXISTING_INSTALL" = "true" ] && [ -f "${CONFIG_DIR}/env" ]; then
    log_info "Updating environment config..."
    # Update values in existing config
    sed -i "s|^MONGO_URI=.*|MONGO_URI=${MONGO_URI}|" "${CONFIG_DIR}/env"
    sed -i "s|^PORT=.*|PORT=${APP_PORT}|" "${CONFIG_DIR}/env"
    # Add JWT_SECRET if missing
    grep -q "^JWT_SECRET=" "${CONFIG_DIR}/env" || {
        JWT_SECRET=$(openssl rand -base64 32)
        echo "JWT_SECRET=${JWT_SECRET}" >> "${CONFIG_DIR}/env"
    }
    log "Environment config updated (secrets preserved)"
else
    log_info "Generating environment config..."
    JWT_SECRET=$(openssl rand -base64 32)
    cat > "${CONFIG_DIR}/env" <<ENVEOF
NODE_ENV=production
PORT=${APP_PORT}
MONGO_URI=${MONGO_URI}
JWT_SECRET=${JWT_SECRET}
ENVEOF
    log "Environment config created at ${CONFIG_DIR}/env"
fi

chmod 600 "${CONFIG_DIR}/env"

# Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd -r -s /bin/false "$SERVICE_USER"
    log "Service user '${SERVICE_USER}' created"
fi
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"

# ── Step 5: Systemd Service ──────────────────────────────
step "5/${TOTAL_STEPS}" "Configuring systemd service"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<SVCEOF
[Unit]
Description=ServerMon — Server Monitoring Platform
After=network.target$([ "$SKIP_MONGO_INSTALL" != "true" ] && echo " mongod.service")
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${CONFIG_DIR}/env
ExecStart=${PNPM_PATH} start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=servermon

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
systemctl start "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "ServerMon service is running"
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

    cat > "$NGINX_CONF" <<NGXEOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

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
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGXEOF

    # Enable the site
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

echo ""
echo -e "  ${DIM}Useful commands:${NC}"
echo -e "  ${DIM}  Status:   systemctl status ${SERVICE_NAME}${NC}"
echo -e "  ${DIM}  Logs:     journalctl -u ${SERVICE_NAME} -f${NC}"
echo -e "  ${DIM}  Restart:  systemctl restart ${SERVICE_NAME}${NC}"
echo -e "  ${DIM}  Config:   ${CONFIG_DIR}/env${NC}"
echo -e "  ${DIM}  Uninstall: sudo $0 --uninstall${NC}"
echo ""
divider
