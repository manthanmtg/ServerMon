# Apps Module Design

## Overview

Apps adds a local deployment control plane to ServerMon. Version 1 deploys pure Next.js applications on the same Linux host as ServerMon, using managed release copies, user-provided commands, systemd for process survival, and Nginx for public routing.

## Key Decisions

- Next.js is the only v1 template because it keeps the first release small while proving the deployment lifecycle.
- Deployments use managed release copies under `SERVERMON_APPS_ROOT` or `/opt/servermon/apps`, so production does not run from a developer working tree.
- Apps run under the same OS user as ServerMon in v1. Per-app Linux users are deferred.
- ServerMon is the control plane only. systemd, Nginx, and the deployed app continue running if ServerMon is down or updating.
- Users provide install, build, and start commands in v1. Auto-detection is a documented future enhancement.

## Core Flow

1. User creates an app from the `nextjs` template.
2. User enters app name, source path, domain, port, install command, build command, start command, health check path, and environment variables.
3. ServerMon validates input and creates app metadata.
4. Deploy creates a timestamped release directory.
5. Source is copied into `releases/<release-id>/source`, excluding `.git`, `node_modules`, `.next`, `dist`, env files, and common caches.
6. ServerMon writes the managed `env` file and `deploy.json` manifest.
7. ServerMon runs install and build commands in the copied source.
8. ServerMon writes a systemd service that runs from `<app-root>/current/source` and reads `<app-root>/current/env`.
9. ServerMon points `current` to the new release, restarts the app service, health-checks it, writes Nginx config, tests Nginx, and reloads Nginx.
10. Failed deploys keep the previous `current` release intact when possible.

## Data Model

Each app stores:

- name and slug
- template id
- source path
- domain
- port
- commands
- environment variables
- health check path
- status
- current release id
- release history
- last deployed timestamp
- latest deployment logs

Secrets are stored as env var values for execution but masked in UI/API responses where summaries are shown.

## UI

The Apps page includes:

- app list with status, domain, port, current release, and last deploy
- create app form for the Next.js template
- deployment progress/log output
- DNS helper showing `A <domain> -> <detected-public-ip>`
- app detail cards for runtime status, commands, release history, and masked env vars
- operational actions for deploy/redeploy and future restart/rollback controls

## Extensibility

Templates are typed descriptors with fields for required inputs, default health path, deployment strategy, and future command detection. Later templates can add Python backends, Docker, Docker Compose, static sites, and multi-process apps without changing the UI contract.

## Non-Goals For V1

- remote fleet-node deployment
- Docker runtime
- per-app Linux users
- automatic package-manager or command detection
- blue/green deploys
- multi-service app composition
- databases or volume orchestration
- full per-app network accounting

## Future TODOs

- Auto-detect package manager and suggest install/build/start commands.
- Detect Next.js standalone output.
- Detect environment variable keys from `.env.example`.
- Add per-app Linux users and stricter resource isolation.
- Add Docker and Docker Compose runtimes.
- Add rollback from the UI.
- Add systemd accounting-based per-app CPU, memory, and network metrics.
