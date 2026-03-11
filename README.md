# ServerMon

A secure, modular, self-hosted server monitoring platform. Real-time metrics, a built-in terminal, process management, and audit logs — all through a clean, theme-aware web interface.

## Features

- **Multi-factor auth** — Argon2 password hashing + TOTP (Google Authenticator)
- **Real-time dashboard** — Live CPU and memory charts via Server-Sent Events
- **Web terminal** — Interactive shell access (xterm.js)
- **Process monitor** — View and manage running processes
- **Audit logs** — Filterable, searchable event history
- **6 themes** — Light, Obsidian, Monokai, Solarized, Nord, Cyberpunk
- **Modular architecture** — Shared UI components, error boundaries, and a module registry for easy extension
- **Mobile-friendly** — Responsive layout with touch-optimized navigation

## Quick Start

**Production (Ubuntu/Debian):**

```bash
git clone https://github.com/manthanmtg/ServerMon.git
cd ServerMon
sudo ./scripts/install.sh
```

The interactive installer handles Node.js, MongoDB, Nginx, and SSL. See [DEPLOY.md](DEPLOY.md) for all options.

**Development (any OS):**

```bash
git clone https://github.com/manthanmtg/ServerMon.git
cd ServerMon
pnpm install
cp .env.example .env.local   # then edit with your MONGO_URI
pnpm dev
```

Open `http://localhost:8912`. The setup wizard will create your admin account on first run.

## Managing the Service

```bash
sudo systemctl status servermon      # check status
sudo journalctl -u servermon -f      # live logs
sudo systemctl restart servermon     # restart
sudo ./scripts/install.sh --uninstall  # remove
```

## Configuration

Runtime config lives in `/etc/servermon/env`:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Application port | `8912` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/servermon` |
| `JWT_SECRET` | Session token secret (auto-generated) | — |
| `NODE_ENV` | Runtime mode | `production` |

## Tech Stack

- **Next.js 16** (App Router) + **TypeScript**
- **MongoDB** (Mongoose) + **Zod** validation
- **Tailwind CSS 4** with CSS variable theming
- **Recharts** for real-time charts
- **xterm.js** for the web terminal
- **Argon2** + **TOTP** for authentication

## Project Structure

```
src/
├── app/              # Next.js pages and API routes
├── components/
│   ├── ui/           # Reusable components (Button, Card, Badge, Input, etc.)
│   ├── layout/       # ProShell (sidebar + header layout)
│   └── modules/      # Widget registry
├── lib/              # Theme context, metrics context, session, DB, utilities
├── modules/          # Feature modules (health, metrics, terminal, processes, logs)
├── models/           # Mongoose models
└── types/            # Shared TypeScript types
```

## Deployment Guide

For production deployments including domain setup, SSL, remote MongoDB, upgrades, and troubleshooting, see **[DEPLOY.md](DEPLOY.md)**.

## License

MIT
