import { InstallTemplate, FULL_SERVICE_PIPELINE } from '../../types';

export const uptimeKumaTemplate: InstallTemplate = {
  id: 'uptime-kuma',
  name: 'Uptime Kuma',
  description: 'Self-hosted monitoring tool with beautiful status pages and notifications.',
  longDescription: `# Uptime Kuma

Uptime Kuma is a fancy self-hosted monitoring tool. It monitors uptime for HTTP(s), TCP, DNS, and more with a beautiful reactive UI.

## Features
- Monitor HTTP(s), TCP, Ping, DNS, and more
- Beautiful status pages
- 90+ notification services (Telegram, Discord, Slack, Email, etc.)
- Multi-language support
- Proxy support and 2FA`,
  category: 'monitoring',
  icon: 'HeartPulse',
  tags: ['monitoring', 'uptime', 'status-page', 'alerts', 'health-check'],
  defaultPipeline: FULL_SERVICE_PIPELINE,
  configSchema: [
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      default: 3001,
      required: true,
      description: 'Port Uptime Kuma will listen on internally',
      validation: { min: 1024, max: 65535 },
    },
    {
      key: 'domain',
      label: 'Domain',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'status.example.com',
      description: 'Domain for Nginx reverse proxy and SSL',
    },
    {
      key: 'dataDir',
      label: 'Data Directory',
      type: 'string',
      default: '/opt/uptime-kuma/data',
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
  uptime-kuma:
    image: louislam/uptime-kuma:latest
    container_name: uptime-kuma
    restart: unless-stopped
    ports:
      - "127.0.0.1:{{config.port}}:3001"
    volumes:
      - "{{config.dataDir}}:/app/data"
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
`,
    },
    {
      id: 'script',
      label: 'Install Script (Node.js)',
      executionMethod: 'script',
      installScript: `#!/bin/bash
set -euo pipefail

echo "==> Installing Uptime Kuma..."

# Install Node.js if not present
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Clone and install
mkdir -p /opt/uptime-kuma
git clone https://github.com/louislam/uptime-kuma.git /opt/uptime-kuma/app
cd /opt/uptime-kuma/app
npm run setup

# Create data directory
mkdir -p {{config.dataDir}}

# Create system user
if ! id -u uptime-kuma &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin uptime-kuma
fi
chown -R uptime-kuma:uptime-kuma /opt/uptime-kuma

echo "==> Uptime Kuma installed successfully."
`,
      systemdTemplate: `[Unit]
Description=Uptime Kuma Monitoring
After=network.target

[Service]
Type=simple
User=uptime-kuma
WorkingDirectory=/opt/uptime-kuma/app
ExecStart=/usr/bin/node server/server.js --port={{config.port}}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
`,
    },
  ],
  detection: [
    { method: 'docker-container', value: 'uptime-kuma' },
    { method: 'systemd-service', value: 'uptime-kuma.service' },
    { method: 'port', value: '3001' },
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
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`,
  healthCheckUrl: 'http://127.0.0.1:{{config.port}}/',
  version: '1.0.0',
  homepage: 'https://uptime.kuma.pet',
  documentationUrl: 'https://github.com/louislam/uptime-kuma/wiki',
};
