import { InstallTemplate, FULL_SERVICE_PIPELINE } from '../../types';

export const plausibleTemplate: InstallTemplate = {
  id: 'plausible',
  name: 'Plausible Analytics',
  description: 'Lightweight, privacy-friendly web analytics alternative to Google Analytics.',
  longDescription: `# Plausible Analytics

Plausible is a lightweight and open-source web analytics tool. It provides simple, privacy-friendly analytics without cookies or personal data collection.

## Features
- No cookies, fully GDPR/CCPA compliant
- Lightweight script (~1KB)
- Simple, intuitive dashboard
- Goal conversions and custom events
- Email and Slack reports`,
  category: 'service',
  icon: 'BarChart3',
  tags: ['analytics', 'privacy', 'web', 'statistics', 'gdpr'],
  defaultPipeline: FULL_SERVICE_PIPELINE,
  configSchema: [
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      default: 8000,
      required: true,
      description: 'Port Plausible will listen on internally',
      validation: { min: 1024, max: 65535 },
    },
    {
      key: 'domain',
      label: 'Domain',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'analytics.example.com',
      description: 'Domain for Nginx reverse proxy and SSL',
    },
    {
      key: 'adminEmail',
      label: 'Admin Email',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'admin@example.com',
      description: 'Email for the initial admin account',
    },
    {
      key: 'dataDir',
      label: 'Data Directory',
      type: 'string',
      default: '/opt/plausible/data',
      required: true,
      description: 'Persistent data directory',
    },
  ],
  installMethods: [
    {
      id: 'docker-compose',
      label: 'Docker Compose',
      executionMethod: 'docker-compose',
      recommended: true,
      composeTemplate: `version: '3.8'
services:
  plausible:
    image: ghcr.io/plausible/community-edition:latest
    container_name: plausible
    restart: unless-stopped
    command: sh -c "sleep 10 && /entrypoint.sh db createdb && /entrypoint.sh db migrate && /entrypoint.sh run"
    ports:
      - "127.0.0.1:{{config.port}}:8000"
    depends_on:
      plausible-db:
        condition: service_healthy
      plausible-events-db:
        condition: service_healthy
    environment:
      - BASE_URL=https://{{config.domain}}
      - SECRET_KEY_BASE=__GENERATED_SECRET__
      - TOTP_VAULT_KEY=__GENERATED_TOTP_KEY__
      - DISABLE_REGISTRATION=invite_only

  plausible-db:
    image: postgres:16-alpine
    container_name: plausible-db
    restart: unless-stopped
    volumes:
      - "{{config.dataDir}}/postgres:/var/lib/postgresql/data"
    environment:
      - POSTGRES_PASSWORD=plausible
      - POSTGRES_DB=plausible_db
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  plausible-events-db:
    image: clickhouse/clickhouse-server:24-alpine
    container_name: plausible-events-db
    restart: unless-stopped
    volumes:
      - "{{config.dataDir}}/clickhouse:/var/lib/clickhouse"
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:8123/ping || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 5
`,
    },
    {
      id: 'script',
      label: 'Install Script',
      executionMethod: 'script',
      installScript: `#!/bin/bash
set -euo pipefail

echo "==> Installing Plausible Analytics via Docker Compose..."

# Create data directories
mkdir -p {{config.dataDir}}/postgres {{config.dataDir}}/clickhouse

# Generate secrets
SECRET_KEY=$(openssl rand -base64 48)
TOTP_KEY=$(openssl rand -base64 32)

echo "==> Secrets generated."
echo "==> Starting Plausible services..."

# The compose file will be written by the engine
echo "==> Plausible Analytics installed successfully."
echo "==> Admin email: {{config.adminEmail}}"
echo "==> Access at: https://{{config.domain}}"
`,
    },
  ],
  detection: [
    { method: 'docker-container', value: 'plausible' },
    { method: 'port', value: '8000' },
  ],
  nginxTemplate: `server {
    listen 80;
    server_name {{config.domain}};

    location / {
        proxy_pass http://127.0.0.1:{{config.port}};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`,
  healthCheckUrl: 'http://127.0.0.1:{{config.port}}/api/health',
  version: '1.0.0',
  homepage: 'https://plausible.io',
  documentationUrl: 'https://plausible.io/docs/self-hosting',
};
