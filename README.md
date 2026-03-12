# ServerMon 🖥️

> A secure, modular, self-hosted server monitoring dashboard. Real-time metrics, built-in terminal, process management, and audit logs — all through a clean, theme-aware web interface.

[![GitHub Stars](https://img.shields.io/github/stars/manthanmtg/ServerMon?style=flat&color=yellow)](https://github.com/manthanmtg/ServerMon/stargazers)
[![License: MIT](https://img.shields.io/github/license/manthanmtg/ServerMon?color=blue)](https://github.com/manthanmtg/ServerMon/blob/main/LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?style=flat&logo=docker)](https://github.com/manthanmtg/ServerMon/pkgs/container/servermon)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org)

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Self-Host with Docker](#self-host-with-docker)
- [Modules](#modules)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Features

ServerMon provides comprehensive server monitoring with a beautiful, themeable interface:

### 📊 Monitoring & Metrics

- **Real-time metrics** — Live CPU, memory, disk, and network stats via Server-Sent Events
- **Interactive charts** — Historical data visualization with Recharts
- **Disk usage** — Per-drive space analysis with breakdown by directory
- **Network stats** — Bandwidth usage, connections, and interface details
- **Hardware sensors** — Temperature, voltage, and fan speed (where available)

### 🐳 Container Management

- **Docker containers** — List, start, stop, restart, and remove containers
- **Container stats** — CPU, memory, network I/O per container
- **Image management** — View and clean up unused images

### 🔔 Alerts & Notifications

- **Custom thresholds** — Set alerts for CPU, memory, disk usage
- **System events** — Track critical events and state changes

### 🛠️ System Management

- **Process monitor** — View and manage running processes
- **Services** — Control systemd services
- **Users** — View logged-in users and session info
- **Updates** — Check for available package updates
- **File browser** — Navigate and manage files via web UI
- **Logs** — Searchable, filterable system and application logs

### 💻 Terminal Access

- **Web terminal** — Full PTY terminal in browser with xterm.js
- **Shell access** — bash, zsh, or any shell you prefer

### 🔐 Security & Auth

- **MFA** — Argon2 password hashing + TOTP (Google Authenticator)
- **Audit logs** — Filterable, searchable event history
- **JWT sessions** — Secure token-based authentication

### 🎨 UI/UX

- **6 beautiful themes** — Light, Obsidian, Monokai, Solarized, Nord, Cyberpunk
- **Mobile responsive** — Touch-optimized navigation and layouts
- **Modular architecture** — Widget-based dashboard with error boundaries

---

## Screenshots

![Dashboard](https://placehold.co/1200x600/1a1a2e/white?text=ServerMon+Dashboard)
![Terminal](https://placehold.co/1200x600/1a1a2e/white?text=Web+Terminal)
![Metrics](https://placehold.co/1200x600/1a1a2e/white?text=Real-time+Metrics)

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 (App Router) + TypeScript |
| **Styling** | Tailwind CSS 4 + CSS Variable Theming |
| **UI Components** | Shadcn/UI |
| **Charts** | Recharts |
| **Database** | MongoDB + Mongoose |
| **Validation** | Zod |
| **Authentication** | Argon2 + TOTP + JWT |
| **Terminal** | xterm.js + PTY |
| **Container Runtime** | Docker Socket |
| **Deployment** | Docker, Docker Compose |

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- MongoDB (local or remote)

### Development

```bash
# Clone the repository
git clone https://github.com/manthanmtg/ServerMon.git
cd ServerMon

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your MongoDB URI
# MONGO_URI=mongodb://localhost:27017/servermon

# Start development server
pnpm dev
```

Open `http://localhost:8912` — the setup wizard will create your admin account on first run.

### Production (Ubuntu/Debian)

```bash
git clone https://github.com/manthanmtg/ServerMon.git
cd ServerMon
sudo ./scripts/install.sh
```

The installer handles Node.js, MongoDB, Nginx, and SSL automatically. See [DEPLOY.md](DEPLOY.md) for all options.

### Managing the Service

```bash
sudo systemctl status servermon      # check status
sudo journalctl -u servermon -f      # live logs
sudo systemctl restart servermon     # restart
sudo ./scripts/install.sh --uninstall  # remove
```

---

## Self-Host with Docker

### Quick Start with Docker Compose

```bash
# Clone and navigate to project
git clone https://github.com/manthanmtg/ServerMon.git
cd ServerMon

# Create environment file
cp .env.example .env

# Start all services
docker-compose up -d
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Application port | `8912` |
| `MONGO_URI` | MongoDB connection string | `mongodb://mongo:27017/servermon` |
| `JWT_SECRET` | Session token secret | auto-generated |
| `NODE_ENV` | Runtime mode | `production` |
| `LOG_LEVEL` | Logging level | `info` |

### Manual Docker Run

```bash
docker run -d \
  --name servermon \
  -p 8912:8912 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e MONGO_URI=mongodb://host.docker.internal:27017/servermon \
  -e JWT_SECRET=your-secret-here \
  --restart unless-stopped \
  ghcr.io/manthanmtg/servermon:latest
```

> **Note:** Mount `/var/run/docker.sock` to enable Docker container management features.

---

## Modules

ServerMon uses a modular architecture — each feature is a self-contained module:

| Module | Description |
|--------|-------------|
| `health` | System health overview and status |
| `metrics` | Real-time CPU, memory, disk, network |
| `docker` | Docker containers and images |
| `terminal` | Web-based terminal emulator |
| `processes` | Process list and management |
| `services` | Systemd services control |
| `logs` | Centralized log viewer |
| `files` | File browser and manager |
| `users` | Logged-in users and sessions |
| `alerts` | Threshold-based alerts |

---

## Roadmap

- [ ] Prometheus exporter integration
- [ ] Multi-server support
- [ ] Plugin system for custom modules
- [ ] Webhook notifications
- [ ] InfluxDB integration for long-term metrics
- [ ] Dark/Light mode auto-switching
- [ ] Custom dashboard layouts
- [ ] Mobile app (PWA)

---

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.

```bash
# Fork the repo
# Create a feature branch
git checkout -b feature/awesome-feature

# Make your changes and commit
git commit -m "feat: add awesome feature"

# Push and create PR
git push origin feature/awesome-feature
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

_Built with ❤️ for self-hosters_
