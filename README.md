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
- **26 built-in feature modules** — Terminal, processes, Docker, disk, network, file browser, services, cron jobs, environment variables, AI agents, self-service installs, and more
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
| **Memory**       | RAM and swap pressure analysis with top memory consumers                                             |
| **Metrics**      | Real-time CPU and memory chart widgets backed by the shared metrics stream                           |
| **Health**       | Core health status widgets for CPU, memory, and disk pressure                                        |
| **Network**      | Real-time bandwidth, interface stats, and connection monitoring                                      |
| **Services**     | Monitor and manage systemd services                                                                  |
| **Cron Jobs**    | View and manage cron schedules and execution history                                                 |
| **Updates**      | Track available system and package updates                                                           |
| **Fleet**        | Centralized management of remote nodes, public routes, and reverse proxies                           |
| **AI Agents**    | Monitor AI coding agent sessions running on the server                                               |
| **AI Runner**    | Configure AI automation profiles, prompts, schedules, and run history                                |
| **Self Service** | Browse and install managed apps, CLI tools, and services                                             |
| **Endpoints**    | Define and execute custom API endpoints, scripts, and webhook proxies                                |
| **EnvVars**      | Inspect and update host-level user environment variables with OS-aware system instructions           |
| **Certificates** | Manage SSL/TLS certificates and renewals                                                             |
| **Ports**        | Monitor open ports and listening services                                                            |
| **Hardware**     | Detailed hardware specifications and health info                                                     |
| **Nginx**        | Manage Nginx configurations and site status                                                          |
| **Security**     | Security configuration and MFA management                                                            |
| **System Logs**  | Search and inspect host and application log output                                                   |
| **Users**        | Manage user accounts, roles, and permissions                                                         |
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

### Always-On On macOS

```bash
pnpm install
cp .env.example .env.local
sudo ./scripts/install-launchd.sh
```

This installs a system `launchd` daemon so ServerMon starts at boot and scheduled runs do not wait for a user login. See [DEPLOY.md](DEPLOY.md) for setup details and management commands.

### Prebuilt Release Artifacts

Tagged releases publish native Linux and macOS tarballs from GitHub Actions so small machines do not need to run `pnpm build` locally. This is especially useful for Raspberry Pi and other low-memory fleet agents.

Release assets are published at [GitHub Releases](https://github.com/manthanmtg/ServerMon/releases):

| Target      | Hub artifact                        | Agent artifact                        |
| ----------- | ----------------------------------- | ------------------------------------- |
| Linux x64   | `servermon-hub-linux-x64.tar.gz`    | `servermon-agent-linux-x64.tar.gz`    |
| Linux arm64 | `servermon-hub-linux-arm64.tar.gz`  | `servermon-agent-linux-arm64.tar.gz`  |
| macOS x64   | `servermon-hub-darwin-x64.tar.gz`   | `servermon-agent-darwin-x64.tar.gz`   |
| macOS arm64 | `servermon-hub-darwin-arm64.tar.gz` | `servermon-agent-darwin-arm64.tar.gz` |

Verify downloads with `SHA256SUMS`:

```bash
BASE_URL="https://github.com/manthanmtg/ServerMon/releases/latest/download"
ASSET="servermon-agent-linux-arm64.tar.gz"

curl -fLO "$BASE_URL/$ASSET"
curl -fLO "$BASE_URL/SHA256SUMS"
grep "  $ASSET$" SHA256SUMS | sha256sum -c -
```

On macOS, use `shasum -a 256 -c -` for the checksum step:

```bash
grep "  $ASSET$" SHA256SUMS | shasum -a 256 -c -
```

Fleet agent onboarding installs from the latest release artifact by default. The generated curl command accepts these optional flags after `bash -s --`:

```bash
# Pin an agent to a specific release artifact
--version v0.1.1

# Keep tracking the latest release artifact
--release latest

# Preserve the old source-build behavior for machines that should track main
--build-from-source --source-ref main

# Use a custom release asset mirror
--release-base-url https://example.com/servermon/releases/v0.1.1
```

Agent installs write `/etc/servermon-agent/install.env`. Fleet-triggered updates and local colocated-agent updates read that file, so release-installed agents continue updating from release artifacts and source-installed agents continue using `git pull`, `pnpm install`, and `pnpm build`.

The Fleet node detail page can also install a full ServerMon hub on a managed node. That flow now defaults to the matching `servermon-hub-<os>-<arch>.tar.gz` release artifact, verifies it with `SHA256SUMS`, and runs the installer in prebuilt mode so Raspberry Pi-class machines do not build Next.js locally. The same form can pin a release version, use a custom release asset base URL, or switch back to source mode with a selected source ref.

Hub installs write `/etc/servermon/env` with `SERVERMON_INSTALL_MODE`, `SERVERMON_VERSION_TARGET`, `SERVERMON_RELEASE_BASE_URL`, and `SERVERMON_SOURCE_REF`. `scripts/update-servermon.sh` reads those values: release installs keep updating from verified hub artifacts, while source installs continue using the git-based update flow.

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

macOS `launchd`:

```bash
sudo launchctl print system/com.servermon.servermon
sudo launchctl kickstart -k system/com.servermon.servermon
sudo ./scripts/install-launchd.sh --uninstall
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
├── install-launchd.sh    # macOS launchd installer
├── servermon.launchd.plist # Reference launchd template
├── servermon-launchd-wrapper.sh # Loads env and starts ServerMon under launchd
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

### Publishing Release Artifacts

Release artifacts are built and attached automatically when a `v*` tag is pushed:

```bash
git tag -a v0.1.1 -m "v0.1.1"
git push origin v0.1.1
```

The release workflow builds Linux and macOS artifacts on native GitHub-hosted runners, prunes development dependencies after the build, generates `SHA256SUMS`, and publishes the assets to the matching GitHub Release.

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
