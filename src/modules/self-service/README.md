# Self Service Module

A fully managed, template-driven installation system for services, CLI tools, and applications. It handles the entire provisioning lifecycle — from install to port binding, firewall rules, Nginx reverse proxy, SSL certificates, systemd services, and health checks.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [How It Works](#how-it-works)
  - [1. Templates](#1-templates)
  - [2. Detection](#2-detection)
  - [3. Execution Engine](#3-execution-engine)
  - [4. Provisioning Pipeline](#4-provisioning-pipeline)
  - [5. Job Management](#5-job-management)
  - [6. Rollback](#6-rollback)
- [API Reference](#api-reference)
- [UI Flow](#ui-flow)
- [Adding a New Template](#adding-a-new-template)
- [Configuration & Types](#configuration--types)

---

## Overview

The Self Service module allows users to browse a catalog of pre-defined templates (e.g., n8n, Gitea, Uptime Kuma, htop) and install them with a guided wizard. Each template supports **multiple installation methods** (Docker Compose, shell commands, package managers, scripts, binary downloads) and includes **automatic detection** of already-installed software.

For full services, the module runs a **9-step provisioning pipeline**:

```
preflight → install → port-bind → firewall → nginx-vhost → ssl-cert → nginx-reload → systemd-unit → health-check
```

For CLI tools, only `preflight → install` is needed.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        UI Layer                         │
│  SelfServicePage → Catalog → Detail → Wizard → Progress │
│  SelfServiceWidget (Dashboard)                          │
└──────────────────────┬──────────────────────────────────┘
                       │ fetch()
┌──────────────────────▼──────────────────────────────────┐
│                     API Routes                          │
│  /templates  /templates/[id]  /install  /history        │
│  /install/[jobId]  /install/[jobId]/rollback            │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  Execution Engine                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Job Manager   │  │ Provisioner  │  │  Executors   │  │
│  │ (CRUD, state) │  │ (pipeline    │  │ (shell,      │  │
│  │               │  │  orchestrator│  │  compose,    │  │
│  │               │  │  + rollback) │  │  package,    │  │
│  │               │  │              │  │  script)     │  │
│  └──────────────┘  └──────┬───────┘  └──────────────┘  │
│                           │                             │
│  ┌────────────────────────▼─────────────────────────┐   │
│  │              Pipeline Steps                       │   │
│  │  preflight │ port-check │ firewall │ nginx-vhost  │   │
│  │  ssl-cert  │ systemd-unit │ health-check          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    System Layer                          │
│  shell commands │ docker compose │ apt/brew │ certbot   │
│  ufw │ nginx │ systemctl │ curl                         │
└─────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/modules/self-service/
├── types.ts                    # All TypeScript types and constants
├── module.ts                   # Module registration (id, widgets, routes, lifecycle)
├── types.test.ts               # Unit tests for types
├── module.test.ts              # Unit tests for module definition
├── README.md                   # This file
│
├── templates/                  # Template definitions (the catalog)
│   ├── index.ts                # Registry: getAllTemplates, getTemplateById, searchTemplates
│   ├── services/
│   │   ├── n8n.ts              # n8n workflow automation
│   │   ├── openwebui.ts        # Open WebUI (AI chat interface)
│   │   ├── gitea.ts            # Gitea git hosting
│   │   ├── plausible.ts        # Plausible Analytics
│   │   └── uptime-kuma.ts      # Uptime Kuma monitoring
│   └── cli-tools/
│       ├── htop.ts             # htop process viewer
│       ├── lazydocker.ts       # lazydocker TUI
│       └── neovim.ts           # Neovim editor
│
├── engine/                     # Execution engine
│   ├── executor.ts             # Base Executor interface + template rendering utils
│   ├── shell-executor.ts       # Runs shell commands, detection helpers
│   ├── compose-executor.ts     # Writes docker-compose.yml + runs docker compose up
│   ├── package-executor.ts     # Detects system package manager + installs packages
│   ├── script-executor.ts      # Writes temp script file + executes it
│   ├── provisioner.ts          # Pipeline orchestrator + detection runner + rollback
│   ├── job-manager.ts          # In-memory job store (create, get, cancel, rollback)
│   └── steps/                  # Individual pipeline step implementations
│       ├── preflight.ts        # Checks for required tools (docker, nginx, certbot, etc.)
│       ├── port-check.ts       # Verifies target port is available
│       ├── firewall.ts         # Configures UFW rules (HTTP/HTTPS)
│       ├── nginx-vhost.ts      # Writes nginx vhost config, creates symlink, tests config
│       ├── ssl-cert.ts         # Let's Encrypt or self-signed certificate provisioning
│       ├── systemd-unit.ts     # Creates, enables, and starts systemd service unit
│       └── health-check.ts     # Polls URL or runs command to verify service is up
│
└── ui/                         # React UI components
    ├── SelfServicePage.tsx     # Main page (catalog tab + history tab)
    ├── SelfServiceWidget.tsx   # Dashboard widget (template count, recent jobs)
    └── components/
        ├── TemplateCard.tsx     # Card component for catalog grid
        ├── TemplateCatalog.tsx  # Searchable, filterable template grid
        ├── TemplateDetail.tsx   # Full template view with detection status + install buttons
        ├── InstallWizard.tsx    # Multi-step config wizard (configure → SSL → review)
        ├── InstallProgress.tsx  # Live progress tracker with expandable step logs
        └── InstallHistory.tsx   # List of all past install jobs with status
```

---

## How It Works

### 1. Templates

Every installable application is defined as an `InstallTemplate` object. A template contains:

| Field | Purpose |
|---|---|
| `id`, `name`, `description` | Identity and display |
| `category` | One of: `service`, `cli-tool`, `development`, `monitoring`, `database` |
| `installMethods[]` | Multiple ways to install (Docker Compose, shell, package manager, script, binary) |
| `defaultPipeline` | The sequence of provisioning steps to run |
| `configSchema[]` | User-configurable fields (domain, port, passwords, etc.) |
| `detection[]` | How to check if the software is already installed |
| `nginxTemplate` | Templated Nginx vhost config (supports `{{variable}}` placeholders) |
| `healthCheckUrl` / `healthCheckCommand` | How to verify the service is running |

**Example — a template with multiple install methods:**

```typescript
export const n8nTemplate: InstallTemplate = {
  id: 'n8n',
  name: 'n8n',
  category: 'service',
  installMethods: [
    {
      id: 'docker-compose',
      label: 'Docker Compose',
      executionMethod: 'docker-compose',
      recommended: true,
      composeTemplate: `version: "3.8"\nservices:\n  n8n:\n    image: n8nio/n8n:latest\n    ports:\n      - "{{port}}:5678"\n    ...`,
    },
    {
      id: 'npm',
      label: 'npm (global)',
      executionMethod: 'shell',
      installCommands: ['npm install -g n8n', 'n8n start --port={{port}}'],
      pipeline: ['preflight', 'install', 'health-check'],  // lighter pipeline
    },
  ],
  detection: [
    { method: 'command', value: 'n8n', versionCommand: 'n8n --version' },
    { method: 'docker-container', value: 'n8n' },
    { method: 'port', value: '5678' },
  ],
  defaultPipeline: FULL_SERVICE_PIPELINE,
  configSchema: [
    { key: 'domain', label: 'Domain', type: 'string', default: '', required: true },
    { key: 'port', label: 'Port', type: 'number', default: 5678, required: true },
  ],
  nginxTemplate: `server {\n  server_name {{domain}};\n  location / {\n    proxy_pass http://127.0.0.1:{{port}};\n  }\n}`,
  healthCheckUrl: 'http://localhost:{{port}}/healthz',
};
```

Templates are registered in `templates/index.ts` which provides:
- `getAllTemplates()` — returns all templates
- `getTemplateById(id)` — lookup by ID
- `searchTemplates({ query, category, tags })` — filtered search
- `toListItem(template)` — maps to a lightweight list item for the API

### 2. Detection

Before installation, the system can detect if software is already present. Detection methods:

| Method | What it checks |
|---|---|
| `command` | Whether a CLI command exists (`which <command>`) |
| `file` | Whether a file/directory exists on disk |
| `port` | Whether a network port is currently in use (`ss -tlnp`) |
| `docker-container` | Whether a Docker container with the given name is running |
| `systemd-service` | Whether a systemd service is active |

The `runDetection()` function in `provisioner.ts` runs all checks for a template and returns an array of `DetectionResult` objects. These are displayed in the UI on the template detail page.

### 3. Execution Engine

The engine has **four executors**, each handling a different installation method:

#### ShellExecutor
Runs an array of shell commands sequentially using `spawn()`. Streams stdout/stderr to the log callback in real time. If any command exits non-zero, the executor returns a failure.

```
ShellExecutor.execute({ method: 'shell', commands: ['apt install -y nginx'] }, onLog)
```

#### ComposeExecutor
Writes a `docker-compose.yml` file to disk (at `/opt/<domain>/<method-id>/`), then runs `docker compose up -d`.

#### PackageExecutor
Auto-detects the system package manager (apt, dnf, yum, brew, pacman, snap) and runs the appropriate install command.

#### ScriptExecutor
Writes a multi-line script to a temp file (`/tmp/self-service-<uuid>.sh`), makes it executable, runs it, and cleans up.

All executors implement the same `Executor` interface:

```typescript
interface Executor {
  execute(payload: ExecutorPayload, onLog: (line: string) => void): Promise<ExecutorResult>;
}
```

#### Template Rendering

Config values are injected into templates using `{{variable}}` syntax. The `renderTemplate()` utility replaces all `{{key}}` placeholders with the corresponding config values.

### 4. Provisioning Pipeline

The pipeline is the heart of the module. It's an ordered sequence of steps that transforms "install this software" into a fully running, SSL-secured, reverse-proxied service.

#### Full Service Pipeline (9 steps)

| # | Step | What it does |
|---|---|---|
| 1 | **preflight** | Checks that required tools are available (docker, nginx, certbot, systemctl, ufw) based on the install method and pipeline |
| 2 | **install** | Runs the actual installation via the appropriate executor |
| 3 | **port-bind** | Verifies the configured port is not already in use |
| 4 | **firewall** | Adds UFW rules to allow HTTP (80) and HTTPS (443). Skips if UFW is not available |
| 5 | **nginx-vhost** | Renders the Nginx template with config values, writes to `/etc/nginx/sites-available/`, creates symlink in `sites-enabled/`, and tests the config |
| 6 | **ssl-cert** | Provisions an SSL certificate — either via Let's Encrypt (`certbot`) or generates a self-signed cert with `openssl` |
| 7 | **nginx-reload** | Reloads Nginx to pick up the new vhost and SSL config |
| 8 | **systemd-unit** | Creates a `.service` file in `/etc/systemd/system/`, runs `daemon-reload`, enables and starts the service |
| 9 | **health-check** | Polls the health check URL (or runs a command) with retries (10 attempts, 5s apart) until the service responds |

#### CLI Tool Pipeline (2 steps)

For simple CLI tools (htop, neovim, lazydocker):

| # | Step | What it does |
|---|---|---|
| 1 | **preflight** | Checks for package manager availability |
| 2 | **install** | Installs via package manager, script, or binary download |

#### Per-Method Pipeline Override

Each install method can override the default pipeline. For example, an npm-based install of n8n might skip nginx/ssl/systemd and only run `preflight → install → health-check`.

#### Step Execution Flow

```
For each step in pipeline:
  1. Mark step as "running"
  2. Fire onUpdate callback (UI polls this)
  3. Execute the step function
  4. On success → mark "success", add to completedSteps
  5. On failure → mark "failed", set job error, STOP pipeline
  6. On exception → mark "failed", set job error, STOP pipeline
```

Each step receives an `onLog` callback that appends log lines to the step's log array. The UI can expand any step to see its logs in real time.

### 5. Job Management

The `job-manager.ts` provides an in-memory store for install jobs:

| Function | Description |
|---|---|
| `createJob(request)` | Creates a new `InstallJob`, starts the pipeline asynchronously, returns immediately |
| `getJob(jobId)` | Returns the current state of a job (including step progress) |
| `getAllJobs()` | Returns all jobs sorted by start time (newest first) |
| `getJobsByStatus(status)` | Filter jobs by status |
| `cancelJob(jobId)` | Cancels a pending/running job |
| `rollbackJob(jobId)` | Initiates rollback for a failed/completed job |

Jobs have these statuses: `pending → running → success | failed | cancelled | rolling-back`

The store is capped at 100 jobs. When exceeded, the oldest completed jobs are pruned.

### 6. Rollback

If a pipeline fails or a user triggers rollback, completed steps are reversed in order:

| Step | Rollback Action |
|---|---|
| **nginx-vhost** | Removes the config from `sites-available` and `sites-enabled` |
| **ssl-cert** | Revokes the Let's Encrypt certificate (via `certbot revoke`) or deletes self-signed certs |
| **systemd-unit** | Stops and disables the service, removes the `.service` file, runs `daemon-reload` |
| **nginx-reload** | Reloads Nginx again to clear the removed config |
| Other steps | No rollback needed (preflight, port-check, firewall, health-check, install) |

---

## API Reference

All routes are under `/api/modules/self-service/`.

### `GET /templates`

List all templates. Supports query parameters:

| Param | Type | Description |
|---|---|---|
| `q` | string | Search query (matches name, description, tags) |
| `category` | string | Filter by category (`service`, `cli-tool`, etc.) |
| `tags` | string | Comma-separated tag filter |

**Response:**
```json
{
  "templates": [
    {
      "id": "n8n",
      "name": "n8n",
      "description": "...",
      "category": "service",
      "installMethods": [{ "id": "docker-compose", "label": "Docker Compose", "recommended": true }],
      "version": "1.0.0"
    }
  ],
  "total": 8
}
```

### `GET /templates/:id`

Get full template details + run detection checks.

**Response:**
```json
{
  "template": { /* full InstallTemplate object */ },
  "detection": [
    { "installed": false, "method": "command", "details": "n8n" },
    { "installed": true, "method": "docker-container", "version": "1.2.3" }
  ]
}
```

### `POST /install`

Start a new installation job.

**Request body:**
```json
{
  "templateId": "n8n",
  "methodId": "docker-compose",
  "config": {
    "domain": "n8n.example.com",
    "port": 5678
  }
}
```

**Response (201):**
```json
{
  "job": {
    "id": "uuid",
    "templateId": "n8n",
    "templateName": "n8n",
    "methodId": "docker-compose",
    "status": "pending",
    "steps": []
  }
}
```

### `GET /install/:jobId`

Get current job status with step-by-step progress and logs.

**Response:**
```json
{
  "job": {
    "id": "uuid",
    "status": "running",
    "steps": [
      { "step": "preflight", "label": "Pre-flight Checks", "status": "success", "logs": ["..."] },
      { "step": "install", "label": "Install Service", "status": "running", "logs": ["..."] }
    ]
  }
}
```

### `DELETE /install/:jobId`

Cancel a pending or running job.

### `POST /install/:jobId/rollback`

Trigger rollback for a failed or completed job.

### `GET /history`

List all jobs (sorted newest first).

---

## UI Flow

```
┌──────────────┐     click      ┌─────────────────┐    "Install"    ┌───────────────┐
│   Catalog    │ ──────────────▶│  Template Detail │ ──────────────▶│ Install Wizard │
│  (grid view) │                │  (detection,     │                │ (configure,    │
│  search +    │   ◀── "Back"   │   methods,       │  ◀── "Back"   │  SSL options,  │
│  filter      │                │   pipeline info) │                │  review)       │
└──────────────┘                └─────────────────┘                └───────┬───────┘
                                                                          │ "Start"
                                                                          ▼
┌──────────────┐     "Done"     ┌─────────────────┐
│   Catalog    │ ◀──────────────│ Install Progress │
│              │                │ (live steps,     │
│              │                │  expandable logs,│
│              │                │  rollback button)│
└──────────────┘                └─────────────────┘
```

### Tabs

The main page has two tabs:
- **Catalog** — Browse and search templates, filter by category
- **History** — View all past installation jobs with status, timing, and rollback options

### Dashboard Widget

The `SelfServiceWidget` shows on the main dashboard:
- Total template count
- Number of successful installs
- Active/failed job count
- 3 most recent jobs with status indicators

---

## Adding a New Template

1. Create a new file in the appropriate directory:
   - Services: `templates/services/<name>.ts`
   - CLI tools: `templates/cli-tools/<name>.ts`

2. Define the `InstallTemplate`:

```typescript
import type { InstallTemplate } from '../../types';
import { FULL_SERVICE_PIPELINE } from '../../types';

export const myAppTemplate: InstallTemplate = {
  id: 'my-app',
  name: 'My App',
  description: 'Short description of what it does',
  category: 'service',
  icon: 'Package',  // Lucide icon name
  tags: ['tag1', 'tag2'],
  version: '1.0.0',

  configSchema: [
    {
      key: 'domain',
      label: 'Domain',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'myapp.example.com',
    },
    {
      key: 'port',
      label: 'HTTP Port',
      type: 'number',
      default: 8080,
      required: true,
    },
  ],

  installMethods: [
    {
      id: 'docker-compose',
      label: 'Docker Compose',
      executionMethod: 'docker-compose',
      recommended: true,
      composeTemplate: `
version: "3.8"
services:
  myapp:
    image: myapp/myapp:latest
    ports:
      - "{{port}}:8080"
    restart: unless-stopped
`,
    },
    {
      id: 'script',
      label: 'Install Script',
      executionMethod: 'script',
      installScript: `
#!/bin/bash
set -e
curl -fsSL https://install.myapp.com | bash
`,
      pipeline: ['preflight', 'install', 'health-check'],
    },
  ],

  detection: [
    { method: 'command', value: 'myapp' },
    { method: 'docker-container', value: 'myapp' },
    { method: 'port', value: '8080' },
  ],

  defaultPipeline: FULL_SERVICE_PIPELINE,

  nginxTemplate: `
server {
    listen 80;
    server_name {{domain}};

    location / {
        proxy_pass http://127.0.0.1:{{port}};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`,

  healthCheckUrl: 'http://localhost:{{port}}/health',
};
```

3. Register it in `templates/index.ts`:

```typescript
import { myAppTemplate } from './services/my-app';

const allTemplates: InstallTemplate[] = [
  // ... existing templates
  myAppTemplate,
];
```

That's it. The template will immediately appear in the catalog, with working detection, install wizard, and managed provisioning.

---

## Configuration & Types

### Key Types

| Type | Purpose |
|---|---|
| `ExecutionMethod` | `'shell' \| 'docker-compose' \| 'package-manager' \| 'binary-download' \| 'script'` |
| `TemplateCategory` | `'service' \| 'cli-tool' \| 'development' \| 'monitoring' \| 'database'` |
| `ProvisionStep` | The 9 pipeline step identifiers |
| `InstallTemplate` | Full template definition |
| `InstallMethod` | One way to install a template |
| `DetectionCheck` | How to detect if software is installed |
| `InstallJob` | Runtime state of an installation (status, steps, logs) |
| `ConfigField` | A user-configurable field (with type, validation, options) |

### Constants

| Constant | Value |
|---|---|
| `FULL_SERVICE_PIPELINE` | All 9 steps in order |
| `CLI_TOOL_PIPELINE` | `['preflight', 'install']` |
| `PROVISION_STEP_LABELS` | Human-readable labels for each step |
| `MAX_RETRIES` (health check) | 10 attempts |
| `RETRY_DELAY_MS` (health check) | 5000ms between retries |
| `SITES_AVAILABLE` | `/etc/nginx/sites-available` |
| `SITES_ENABLED` | `/etc/nginx/sites-enabled` |
| `SYSTEMD_DIR` | `/etc/systemd/system` |
| `MAX_JOBS` (job store) | 100 jobs in memory |

### Template Variable Syntax

All templates (Nginx config, Docker Compose, systemd units, commands) support `{{variableName}}` placeholders. These are replaced at runtime with values from the user's config + SSL mode selection.

Example: `proxy_pass http://127.0.0.1:{{port}};` with config `{ port: 5678 }` becomes `proxy_pass http://127.0.0.1:5678;`
