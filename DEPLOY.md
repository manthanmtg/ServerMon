# Deployment Guide

This guide covers every way to deploy ServerMon — from a quick one-liner to a fully configured production setup with a custom domain and SSL.

---

## Prerequisites

| Requirement | Minimum |
|---|---|
| OS | Ubuntu 22.04+ or Debian 11+ |
| Architecture | x86_64 or ARM64 |
| RAM | 512 MB |
| Disk | 1 GB free |
| Access | Root or sudo |
| Ports | 8912 (app), 80/443 (if using Nginx) |

MongoDB and Node.js are installed automatically if not present.

---

## Quick Start

Clone the repository and run the installer:

```bash
git clone https://github.com/manthanmtg/ServerMon.git
cd ServerMon
sudo ./scripts/install.sh
```

The interactive installer will walk you through configuration. Once complete, open `http://<your-server-ip>:8912` in a browser to run the setup wizard.

---

## Installation Options

The installer accepts CLI flags for every configuration option. Anything not provided as a flag is prompted interactively (unless `--unattended` is set, in which case defaults are used).

```
Usage: sudo ./scripts/install.sh [OPTIONS]

Options:
  --port PORT          Application port (default: 8912)
  --mongo-uri URI      MongoDB connection string
  --domain DOMAIN      Domain name for Nginx reverse proxy
  --ssl                Enable SSL via Let's Encrypt (requires --domain)
  --skip-mongo         Skip local MongoDB installation
  --unattended         Non-interactive mode, use defaults/flags
  --uninstall          Remove ServerMon completely
  -h, --help           Show help
```

---

## Deployment Scenarios

### 1. Basic — IP Access Only

The simplest setup. No domain, no Nginx. Access ServerMon directly on port 8912.

```bash
sudo ./scripts/install.sh
```

When prompted:
- **Port**: press Enter for default `8912`
- **MongoDB URI**: press Enter for local `mongodb://localhost:27017/servermon`
- **Domain**: press Enter (leave empty)
- **Nginx**: `n`

Access at: `http://<server-ip>:8912`

### 2. Domain + Nginx (no SSL)

Puts Nginx in front of the app so you can access it on port 80 via a domain.

```bash
sudo ./scripts/install.sh --domain mon.example.com
```

**Before running**, point your DNS A record for `mon.example.com` to your server's public IP.

Access at: `http://mon.example.com`

### 3. Domain + Nginx + SSL (recommended for production)

Full production setup with HTTPS via Let's Encrypt.

```bash
sudo ./scripts/install.sh --domain mon.example.com --ssl
```

**Before running:**
1. Point DNS A record for `mon.example.com` to your server's public IP
2. Ensure ports 80 and 443 are open in your firewall

Access at: `https://mon.example.com`

The certificate auto-renews via a systemd timer installed by Certbot.

### 4. Remote MongoDB

Use a managed MongoDB (Atlas, DigitalOcean, etc.) instead of installing one locally.

```bash
sudo ./scripts/install.sh \
  --mongo-uri "mongodb+srv://user:pass@cluster.mongodb.net/servermon" \
  --skip-mongo
```

Or with everything:

```bash
sudo ./scripts/install.sh \
  --mongo-uri "mongodb+srv://user:pass@cluster.mongodb.net/servermon" \
  --skip-mongo \
  --domain mon.example.com \
  --ssl
```

### 5. Fully Automated (CI/scripts)

Use `--unattended` for zero-prompt installations. All config must be provided via flags.

```bash
sudo ./scripts/install.sh \
  --unattended \
  --port 8912 \
  --domain mon.example.com \
  --ssl
```

Or with remote MongoDB:

```bash
sudo ./scripts/install.sh \
  --unattended \
  --mongo-uri "mongodb://db.internal:27017/servermon" \
  --skip-mongo \
  --domain mon.example.com \
  --ssl
```

---

## What the Installer Does

Step by step, the installer:

| Step | What happens |
|---|---|
| 1 | Installs base packages (`curl`, `git`, `build-essential`, `lsof`) |
| 2 | Installs Node.js 20 LTS and pnpm (skips if already present) |
| 3 | Installs MongoDB 7.0 and starts it (skipped with `--skip-mongo`) |
| 4 | Copies source to `/opt/servermon`, runs `pnpm install` and `pnpm build` |
| 5 | Generates `/etc/servermon/env` with JWT secret, creates systemd service |
| 6 | *(optional)* Installs Nginx, generates reverse proxy config, sets up SSL |

Files created:

| Path | Purpose |
|---|---|
| `/opt/servermon/` | Application directory |
| `/etc/servermon/env` | Environment config (secrets, MongoDB URI, port) |
| `/etc/systemd/system/servermon.service` | Systemd service unit |
| `/etc/nginx/sites-available/servermon` | Nginx config (if using Nginx) |

---

## First-Time Setup

After installation, open the web UI. On first launch you'll see the **Setup Wizard**:

1. **Create admin account** — choose a username and password (min 8 characters)
2. **Configure 2FA** — scan the QR code with Google Authenticator, Authy, or any TOTP app
3. **Verify** — enter the 6-digit code to confirm

You'll then be redirected to the login page. Sign in with your credentials + TOTP code.

---

## Upgrading

Re-running the installer on a server with an existing installation performs an upgrade:

```bash
cd ServerMon
git pull origin main
sudo ./scripts/install.sh
```

The upgrade:
- Preserves your `/etc/servermon/env` (JWT secret, MongoDB URI)
- Preserves your MongoDB data
- Rebuilds the application from the latest source
- Restarts the service

Your admin account, TOTP configuration, and all data remain intact.

---

## Uninstalling

```bash
sudo ./scripts/install.sh --uninstall
```

This removes:
- The systemd service
- `/opt/servermon/` (application files)
- `/etc/servermon/` (config)
- The `servermon` system user
- Nginx site config (if it exists)

It does **not** remove:
- MongoDB (or your database data)
- Nginx itself
- Node.js

To fully clean up MongoDB data after uninstall:

```bash
mongosh --eval 'use servermon; db.dropDatabase()'
```

---

## Managing the Service

```bash
# Check if ServerMon is running
sudo systemctl status servermon

# View live logs
sudo journalctl -u servermon -f

# Restart after config changes
sudo systemctl restart servermon

# Stop the service
sudo systemctl stop servermon

# Start the service
sudo systemctl start servermon
```

---

## Configuration

All runtime configuration lives in `/etc/servermon/env`:

```env
NODE_ENV=production
PORT=8912
MONGO_URI=mongodb://localhost:27017/servermon
JWT_SECRET=<auto-generated>
```

After editing this file, restart the service:

```bash
sudo systemctl restart servermon
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port the app listens on | `8912` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/servermon` |
| `JWT_SECRET` | Secret for signing session tokens (auto-generated) | — |
| `NODE_ENV` | Runtime mode | `production` |

---

## Domain & DNS Setup

If you want to access ServerMon via a domain name:

1. **Buy/use a domain** from any registrar (Namecheap, Cloudflare, etc.)
2. **Create an A record** pointing to your server's public IP:

   ```
   Type: A
   Name: mon          (or @ for root domain)
   Value: 203.0.113.1  (your server IP)
   TTL: 300
   ```

3. **Wait for propagation** (usually 1-5 minutes, up to 48 hours)
4. **Run the installer** with `--domain`:

   ```bash
   sudo ./scripts/install.sh --domain mon.example.com --ssl
   ```

### Adding SSL Later

If you installed without `--ssl` and want to add it later:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mon.example.com
```

Certbot will automatically modify your Nginx config and set up auto-renewal.

### Verifying SSL Renewal

```bash
sudo certbot renew --dry-run
```

---

## Local Development

For developing on your own machine (no systemd, no Nginx):

```bash
git clone https://github.com/manthanmtg/ServerMon.git
cd ServerMon
pnpm install
```

Create `.env.local`:

```env
MONGO_URI=mongodb://localhost:27017/servermon
JWT_SECRET=any-dev-secret
```

Start the dev server:

```bash
pnpm dev
```

Open `http://localhost:8912`. The setup wizard will appear on first run.

---

## Troubleshooting

### ServerMon won't start

```bash
# Check the logs
sudo journalctl -u servermon -n 50 --no-pager

# Common issue: MongoDB not running
sudo systemctl status mongod

# Common issue: port already in use
sudo lsof -i :8912
```

### Can't connect in the browser

```bash
# Verify the service is running
sudo systemctl status servermon

# Check if the port is open
curl -s http://localhost:8912 | head -5

# If using a firewall, open the port
sudo ufw allow 8912    # direct access
sudo ufw allow 80      # Nginx HTTP
sudo ufw allow 443     # Nginx HTTPS
```

### MongoDB connection errors

```bash
# Check MongoDB is running
sudo systemctl status mongod

# Test the connection
mongosh "mongodb://localhost:27017/servermon" --eval "db.stats()"

# Check the configured URI
sudo cat /etc/servermon/env | grep MONGO_URI
```

### Nginx returns 502 Bad Gateway

```bash
# 1. Is ServerMon running?
sudo systemctl status servermon

# 2. Check the health endpoint directly (bypasses Nginx)
curl -s http://localhost:8912/api/health | python3 -m json.tool

# 3. Port mismatch between Nginx and the app?
grep PORT /etc/servermon/env
grep proxy_pass /etc/nginx/sites-available/servermon

# 4. Check Nginx error log for details
sudo tail -20 /var/log/nginx/servermon_error.log

# 5. Is the process hitting memory limits?
sudo journalctl -u servermon --since "10 min" | grep -i "memory\|oom\|killed"
```

### SSE streams stalling or disconnecting

If the dashboard charts freeze or show "Connecting...":

```bash
# Check how many SSE connections are active (max 20)
curl -s http://localhost:8912/api/health | python3 -c "import sys,json; print('SSE connections:', json.load(sys.stdin)['sseConnections'])"

# Verify Nginx is not buffering SSE (should have proxy_buffering off)
grep -A5 "metrics/stream" /etc/nginx/sites-available/servermon

# Check for SSE errors in the app logs
sudo journalctl -u servermon --since "5 min" | grep -i "sse"
```

If connections are at the limit (20), close unused browser tabs.

### SSL certificate errors

```bash
# Check certificate status
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Check Nginx config
sudo nginx -t
```

### Reset admin credentials

If you're locked out, drop the users collection and restart to trigger the setup wizard:

```bash
mongosh "mongodb://localhost:27017/servermon" --eval "db.users.drop()"
sudo systemctl restart servermon
```

Then visit the web UI to create a new admin account.

---

## Logging

All ServerMon logs go to journald with structured output (timestamps, log levels, context tags).

### Viewing logs

```bash
# Live log stream
sudo journalctl -u servermon -f

# Last 50 lines
sudo journalctl -u servermon -n 50 --no-pager

# Errors only
sudo journalctl -u servermon -p err

# Last 5 minutes
sudo journalctl -u servermon --since "5 min"

# Today's logs
sudo journalctl -u servermon --since today

# Specific time range
sudo journalctl -u servermon --since "2026-03-11 14:00" --until "2026-03-11 15:00"

# Search for a keyword
sudo journalctl -u servermon | grep "metrics"
```

### Log format

Logs follow this structure:

```
TIMESTAMP [LEVEL] [CONTEXT] Message {optional data}
```

Example output:

```
2026-03-11T10:30:00.123Z [INFO] [sse] SSE connection opened (active: 3)
2026-03-11T10:30:02.456Z [ERROR] [metrics] Failed to poll system metrics {...}
2026-03-11T10:30:05.789Z [WARN] [sse] SSE connection rejected: limit reached
```

Context tags tell you which subsystem produced the log:
- `metrics` — system metric polling
- `sse` — SSE stream connections
- `api:processes` — process list API
- `api:analytics` — audit log API

### Health check

The `/api/health` endpoint provides a machine-readable status:

```bash
curl -s http://localhost:8912/api/health | python3 -m json.tool
```

```json
{
    "status": "ok",
    "uptime": 86400,
    "database": "connected",
    "metrics": { "cpu": 12.5, "memory": 45.2 },
    "sseConnections": 2,
    "timestamp": "2026-03-11T10:30:00.000Z"
}
```

| Field | Meaning |
|---|---|
| `status` | `ok` (HTTP 200) or `degraded` (HTTP 503) |
| `uptime` | Seconds since the process started |
| `database` | `connected`, `disconnected`, or `error` |
| `metrics` | Latest CPU/memory reading, or `null` if not yet available |
| `sseConnections` | Number of active SSE streams (max 20) |

Use this for external monitoring (UptimeRobot, Pingdom, etc.) — alert when status is not `200`.

### Resource limits

The systemd service enforces memory limits to prevent runaway usage:

| Setting | Value | Effect |
|---|---|---|
| `MemoryHigh` | 384 MB | Kernel starts reclaiming memory |
| `MemoryMax` | 512 MB | Hard kill if exceeded |
| `StartLimitBurst` | 5 in 300s | Prevents restart loops |
| `RestartSec` | 5s | Delay between restarts |

To check current memory usage:

```bash
systemctl status servermon | grep Memory
```
