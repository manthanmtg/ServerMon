#!/bin/bash

# ServerMon One-Click Installer
# Target OS: Ubuntu 22.04+ / Debian 11+

set -e

RED='\033[0,31m'
GREEN='\033[0,32m'
BLUE='\033[0,34m'
NC='\033[0m'

echo -e "${BLUE}==============================${NC}"
echo -e "${BLUE}   ServerMon Installation   ${NC}"
echo -e "${BLUE}==============================${NC}"

# Check for root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (use sudo).${NC}"
  exit 1
fi

# 1. Update & Base Dependencies
echo -e "${GREEN}[1/5] Updating system and installing base dependencies...${NC}"
apt-get update -y && apt-get install -y curl git build-essential

# 2. Install Node.js (v20 LTS) & PNPM
if ! command -v node &> /dev/null; then
  echo -e "${GREEN}[2/5] Installing Node.js v20...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo -e "${GREEN}[2/5] Node.js already installed: $(node -v)${NC}"
fi

if ! command -v pnpm &> /dev/null; then
  echo -e "${GREEN}[2/5] Installing pnpm...${NC}"
  npm install -g pnpm
else
  echo -e "${GREEN}[2/5] pnpm already installed: $(pnpm -v)${NC}"
fi

# Stop existing service if it exists (Re-installation logic)
if systemctl list-unit-files | grep -q 'servermon.service'; then
  echo -e "${RED}Existing ServerMon service detected. Stopping and removing old service...${NC}"
  systemctl stop servermon || true
  systemctl disable servermon || true
fi

# Kill any stray processes listening on port 8912
if command -v lsof &> /dev/null; then
    PID=$(lsof -t -i:8912)
    if [ -n "$PID" ]; then
        echo -e "${RED}Killing existing processes on port 8912 (PIDs: $PID)...${NC}"
        kill -9 $PID || true
    fi
else
    # Fallback to fuser if lsof is missing
    fuser -k 8912/tcp || true
fi

# 3. Install MongoDB
if ! command -v mongod &> /dev/null; then
  echo -e "${GREEN}[3/5] Installing MongoDB...${NC}"
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update -y
  apt-get install -y mongodb-org
  systemctl enable mongod
  systemctl start mongod
else
  echo -e "${GREEN}[3/5] MongoDB already installed.${NC}"
fi

# 4. App Setup
echo -e "${GREEN}[4/5] Setting up ServerMon Application...${NC}"
INSTALL_DIR="/opt/servermon"

if [ -d "$INSTALL_DIR" ]; then
  echo -e "${BLUE}Updating existing installation in $INSTALL_DIR...${NC}"
  # Backup old env if exists (legacy check)
  if [ -f /etc/servermon/env ]; then
    cp /etc/servermon/env /tmp/servermon_env_backup
  fi
  
  # Remove old files but keep the directory
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name ".env" -exec rm -rf {} +
  cp -r . "$INSTALL_DIR/"
else
  mkdir -p "$INSTALL_DIR"
  cp -r . "$INSTALL_DIR/"
fi

cd "$INSTALL_DIR"

# Install dependencies using pnpm
echo "Installing dependencies with pnpm..."
pnpm install

# Build the app
echo "Building ServerMon..."
pnpm run build

# Setup Environment
mkdir -p /etc/servermon
if [ ! -f /etc/servermon/env ]; then
  echo "Generating default environment config..."
  JWT_SECRET=$(openssl rand -base64 32)
  cat > /etc/servermon/env <<EOF
MONGO_URI=mongodb://localhost:27017/servermon
JWT_SECRET=$JWT_SECRET
PORT=8912
NODE_ENV=production
EOF
  chmod 600 /etc/servermon/env
elif [ -f /tmp/servermon_env_backup ]; then
  echo "Restoring previous environment config..."
  mv /tmp/servermon_env_backup /etc/servermon/env
fi

# Create system user
if ! id "servermon" &>/dev/null; then
  useradd -r -s /bin/false servermon
fi
chown -R servermon:servermon "$INSTALL_DIR"

# 5. Systemd Service
echo -e "${GREEN}[5/5] Configuring Systemd Service...${NC}"
cp scripts/servermon.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable servermon
systemctl start servermon

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}SUCCESS: ServerMon is now running!${NC}"
echo -e "Access the web UI at: ${BLUE}http://$(curl -s ifconfig.me):8912${NC}"
echo -e "Check status with: ${BLUE}systemctl status servermon${NC}"
echo -e "${BLUE}========================================${NC}"
