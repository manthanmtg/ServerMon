<div align="center">

# ServerMon

**A secure, modular, self-hosted server monitoring and management platform.**

Real-time metrics · Web terminal · Docker management · File browser · AI agent monitoring
— all through a beautiful, theme-aware web interface.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![codecov](https://codecov.io/gh/manthanmtg/ServerMon/graph/badge.svg?token=94SEBA831Y)](https://codecov.io/gh/manthanmtg/ServerMon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Highlights

- **Multi-factor authentication** — Argon2 password hashing + TOTP (Google Authenticator compatible)
- **Real-time dashboard** — Live CPU, memory, and network charts via Server-Sent Events
- **19 built-in modules** — Terminal, processes, Docker, disk, network, file browser, services, cron jobs, AI agents, and more
- **6 stunning themes** — Light, Obsidian, Monokai, Solarized, Nord, and Cyberpunk
- **One-command deployment** — Interactive installer handles Node.js, MongoDB, Nginx, and SSL
- **Modular architecture** — Error boundaries per widget, shared UI components, and a module registry for easy extension
- **Mobile-friendly** — Responsive layout with touch-optimized navigation

---

## Modules

ServerMon ships with a rich set of modules out of the box:

| Module           | Description                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| **Dashboard**    | Real-time CPU, memory, and system health widgets with live charts                                    |
| **Terminal**     | Full interactive web terminal powered by xterm.js and node-pty                                       |
| **Processes**    | View, search, and manage running processes                                                           |
| **File Browser** | Navigate the filesystem, preview files, and edit with a built-in CodeMirror 6 editor (20+ languages) |
| **Docker**       | Monitor containers, images, volumes, and networks                                                    |
| **Disk**         | Disk usage, I/O performance, and storage health monitoring                                           |
| **Network**      | Real-time bandwidth, interface stats, and connection monitoring                                      |
| **Services**     | Monitor and manage systemd services                                                                  |
| **Cron Jobs**    | View and manage cron schedules and execution history                                                 |
| **Updates**      | Track available system and package updates                                                           |
| **AI Agents**    | Monitor AI coding agent sessions running on the server                                               |
| **Certificates** | Manage SSL/TLS certificates and renewals                                                             |
| **Ports**        | Monitor open ports and listening services                                                            |
| **Hardware**     | Detailed hardware specifications and health info                                                     |
| **Nginx**        | Manage Nginx configurations and site status                                                          |
| **Security**     | Security configuration and MFA management                                                            |
| **Audit Logs**   | Filterable, searchable event history for all system actions                                          |
| **Guide**        | Built-in interactive onboarding and documentation                                                    |

---

## Quick Start

### Production (Ubuntu/Debian)

```bash
git clone https://github.com/manthanmtg/ServerMon.git
cd ServerMon
sudo ./scripts/install.sh
```

The interactive installer walks you through everything. See [DEPLOY.md](DEPLOY.md) for all options including domain setup, SSL, remote MongoDB, and unattended installs.

### Local Development

```bash
git clone https://github.com/manthanmtg/ServerMon.git
cd ServerMon
pnpm install
```

Create a `.env.local` file:

```env
MONGO_URI=mongodb://localhost:27017/servermon
JWT_SECRET=any-dev-secret
```

Start the dev server:

```bash
pnpm dev
```

Open **http://localhost:8912** — the setup wizard will create your admin account on first run.

---

## Managing the Service

```bash
sudo systemctl status servermon        # check status
sudo journalctl -u servermon -f        # live logs
sudo systemctl restart servermon       # restart after config changes
sudo ./scripts/install.sh --uninstall  # remove completely
```

---

## Configuration

Runtime config lives in `/etc/servermon/env` (production) or `.env.local` (development):

| Variable     | Required | Description                                        | Default                               |
| ------------ | -------- | -------------------------------------------------- | ------------------------------------- |
| `MONGO_URI`  | Yes      | MongoDB connection string                          | `mongodb://localhost:27017/servermon` |
| `JWT_SECRET` | Yes      | Session token secret (auto-generated by installer) | —                                     |
| `PORT`       | No       | Application port                                   | `8912`                                |
| `NODE_ENV`   | No       | `development` or `production`                      | `production`                          |
| `LOG_LEVEL`  | No       | `debug`, `info`, `warn`, `error`                   | `info`                                |

---

## Tech Stack

| Layer           | Technology                                          |
| --------------- | --------------------------------------------------- |
| **Framework**   | Next.js 16 (App Router) + TypeScript (strict)       |
| **Database**    | MongoDB 7+ with Mongoose                            |
| **Validation**  | Zod 4                                               |
| **Styling**     | Tailwind CSS 4 with CSS variable theming            |
| **Charts**      | Recharts                                            |
| **Terminal**    | xterm.js + node-pty                                 |
| **Code Editor** | CodeMirror 6 (20+ language modes)                   |
| **Real-time**   | Server-Sent Events (metrics) + Socket.IO (terminal) |
| **Auth**        | Argon2 + TOTP + JWT sessions                        |
| **Icons**       | Lucide React                                        |

---

## Themes

Switch between **6 built-in themes** from Settings — every module respects the active theme via CSS variables:

| Theme         | Style                            |
| ------------- | -------------------------------- |
| **Light**     | Clean white, indigo accents      |
| **Obsidian**  | Deep dark slate (default)        |
| **Monokai**   | Classic warm dark                |
| **Solarized** | Ethan Schoonover's light palette |
| **Nord**      | Arctic blue-grey                 |
| **Cyberpunk** | Neon pink synthwave              |

---

## Project Structure

```
src/
├── app/                  # Next.js pages and API routes
│   ├── api/              # REST API endpoints
│   ├── dashboard/        # Dashboard page
│   ├── terminal/         # Terminal page
│   ├── docker/           # Docker management page
│   ├── ...               # Other module pages
│   └── setup/            # First-time setup wizard
├── components/
│   ├── ui/               # Reusable components (Button, Card, Badge, Input, etc.)
│   ├── layout/           # ProShell — sidebar + header layout
│   └── modules/          # Widget registry and error boundaries
├── lib/                  # Theme context, metrics context, session, DB, logger, utilities
├── modules/              # Feature modules — each self-contained with module.ts, ui/, types
├── models/               # Mongoose models
└── types/                # Shared TypeScript types
scripts/
├── install.sh            # One-command production installer
├── servermon.service     # Systemd unit file
└── nginx.conf            # Nginx reverse proxy template
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (React)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │Dashboard │ │ Terminal  │ │  Docker  │ │  ...   │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │
│       │ SSE        │ WS         │ REST       │      │
└───────┼────────────┼────────────┼────────────┼──────┘
        │            │            │            │
┌───────┴────────────┴────────────┴────────────┴──────┐
│              Next.js Custom Server (Node.js)         │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  SSE    │ │Socket.IO │ │API Routes│ │Middleware│ │
│  │ Metrics │ │ Terminal  │ │  (REST)  │ │  (Auth) │ │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └─────────┘ │
│       │           │            │                     │
│  ┌────┴───────────┴────────────┴──────────────────┐ │
│  │           systeminformation / node-pty          │ │
│  └────────────────────┬───────────────────────────┘ │
└───────────────────────┼─────────────────────────────┘
                        │
                   ┌────┴────┐
                   │ MongoDB │
                   └─────────┘
```

**Key design decisions:**

- **Single SSE connection** — `MetricsProvider` opens one `EventSource`; all widgets consume via `useMetrics()`
- **CSS variable theming** — colors flow through CSS variables in `globals.css`, applied via Tailwind's `@theme inline`
- **Error boundaries per widget** — one crashing module never takes down the page
- **Middleware-first auth** — all routes require authentication by default; public routes are an explicit allowlist

---

## Security

ServerMon is designed to be exposed to the internet with confidence:

- **Argon2** password hashing with salting
- **TOTP two-factor auth** (Google Authenticator, Authy, etc.)
- **JWT session tokens** with configurable expiry
- **Middleware-protected routes** — every page and API is authenticated by default
- **Rate limiting** on login attempts
- **No hardcoded secrets** — JWT secrets are auto-generated at install time

---

## Deployment Scenarios

| Scenario                       | Command                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ |
| **Basic** (IP only)            | `sudo ./scripts/install.sh`                                              |
| **Domain + Nginx**             | `sudo ./scripts/install.sh --domain mon.example.com`                     |
| **Domain + SSL** (recommended) | `sudo ./scripts/install.sh --domain mon.example.com --ssl`               |
| **Remote MongoDB**             | `sudo ./scripts/install.sh --mongo-uri "mongodb+srv://..." --skip-mongo` |
| **Fully automated**            | `sudo ./scripts/install.sh --unattended --domain mon.example.com --ssl`  |

See **[DEPLOY.md](DEPLOY.md)** for the full deployment guide including upgrading, troubleshooting, logging, and health checks.

---

## Development

```bash
pnpm dev          # Start dev server with hot reload
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript type checking
pnpm check        # Run all checks (lint + typecheck + build + test)
```

See **[AGENTS.md](AGENTS.md)** for code conventions, module checklists, and CI requirements.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-module`)
3. Follow the [module checklist](AGENTS.md) for new modules
4. Run `pnpm check` to verify everything passes
5. Open a pull request

---

## License

[MIT](LICENSE)
