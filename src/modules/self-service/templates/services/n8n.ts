import { InstallTemplate, FULL_SERVICE_PIPELINE } from '../../types';

export const n8nTemplate: InstallTemplate = {
  id: 'n8n',
  name: 'n8n',
  description: 'Workflow automation platform with 400+ integrations.',
  longDescription: `# n8n — Workflow Automation

n8n is a free and source-available workflow automation tool. It allows you to connect anything to everything via its fair-code model.

## Features
- 400+ built-in integrations
- Visual workflow editor
- Self-hosted for full data control
- Custom JavaScript/Python code nodes
- Webhook triggers and scheduling`,
  category: 'service',
  icon: 'Workflow',
  tags: ['automation', 'workflow', 'integrations', 'no-code'],
  defaultPipeline: FULL_SERVICE_PIPELINE,
  configSchema: [
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      default: 5678,
      required: true,
      description: 'Port n8n will listen on internally',
      validation: { min: 1024, max: 65535 },
    },
    {
      key: 'domain',
      label: 'Domain',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'n8n.example.com',
      description: 'Domain for Nginx reverse proxy and SSL',
    },
    {
      key: 'dataDir',
      label: 'Data Directory',
      type: 'string',
      default: '/opt/n8n/data',
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
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    ports:
      - "127.0.0.1:{{config.port}}:5678"
    volumes:
      - "{{config.dataDir}}:/home/node/.n8n"
    environment:
      - N8N_HOST={{config.domain}}
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://{{config.domain}}/
      - GENERIC_TIMEZONE=UTC
`,
    },
    {
      id: 'npm',
      label: 'npm (Native)',
      executionMethod: 'shell',
      installCommands: [
        'npm install -g n8n',
        'mkdir -p {{config.dataDir}}',
      ],
      systemdTemplate: `[Unit]
Description=n8n Workflow Automation
After=network.target

[Service]
Type=simple
User=n8n
Environment=N8N_HOST={{config.domain}}
Environment=N8N_PORT={{config.port}}
Environment=N8N_PROTOCOL=https
Environment=N8N_USER_FOLDER={{config.dataDir}}
ExecStart=/usr/bin/n8n start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
`,
    },
    {
      id: 'script',
      label: 'Install Script',
      executionMethod: 'script',
      installScript: `#!/bin/bash
set -euo pipefail

echo "==> Installing n8n via install script..."

# Install Node.js if not present
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Install n8n globally
echo "==> Installing n8n via npm..."
npm install -g n8n

# Create data directory
mkdir -p {{config.dataDir}}

# Create n8n system user if not exists
if ! id -u n8n &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin n8n
fi
chown -R n8n:n8n {{config.dataDir}}

echo "==> n8n installed successfully."
`,
    },
  ],
  detection: [
    { method: 'command', value: 'n8n --version', versionCommand: 'n8n --version' },
    { method: 'docker-container', value: 'n8n' },
    { method: 'systemd-service', value: 'n8n.service' },
    { method: 'port', value: '5678' },
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
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
`,
  healthCheckUrl: 'http://127.0.0.1:{{config.port}}/healthz',
  version: '1.0.0',
  homepage: 'https://n8n.io',
  documentationUrl: 'https://docs.n8n.io',
};
