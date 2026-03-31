import { InstallTemplate, FULL_SERVICE_PIPELINE } from '../../types';

export const giteaTemplate: InstallTemplate = {
  id: 'gitea',
  name: 'Gitea',
  description: 'Lightweight self-hosted Git service with issue tracking and CI/CD.',
  longDescription: `# Gitea — Self-Hosted Git Service

Gitea is a painless, self-hosted, all-in-one software development service including Git hosting, code review, team collaboration, package registry, and CI/CD.

## Features
- Lightweight and fast (runs on a Raspberry Pi)
- Issue tracking and project boards
- Built-in CI/CD (Gitea Actions)
- Package registry support
- OAuth2 and LDAP authentication`,
  category: 'service',
  icon: 'GitBranch',
  tags: ['git', 'devops', 'ci-cd', 'code-hosting', 'version-control'],
  defaultPipeline: FULL_SERVICE_PIPELINE,
  configSchema: [
    {
      key: 'httpPort',
      label: 'HTTP Port',
      type: 'number',
      default: 3000,
      required: true,
      description: 'Web UI port',
      validation: { min: 1024, max: 65535 },
    },
    {
      key: 'sshPort',
      label: 'SSH Port',
      type: 'number',
      default: 2222,
      required: true,
      description: 'Git SSH port',
      validation: { min: 1024, max: 65535 },
    },
    {
      key: 'domain',
      label: 'Domain',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'git.example.com',
      description: 'Domain for Nginx reverse proxy and SSL',
    },
    {
      key: 'dataDir',
      label: 'Data Directory',
      type: 'string',
      default: '/opt/gitea/data',
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
  gitea:
    image: gitea/gitea:latest
    container_name: gitea
    restart: unless-stopped
    ports:
      - "127.0.0.1:{{config.httpPort}}:3000"
      - "{{config.sshPort}}:22"
    volumes:
      - "{{config.dataDir}}:/data"
      - "/etc/timezone:/etc/timezone:ro"
      - "/etc/localtime:/etc/localtime:ro"
    environment:
      - USER_UID=1000
      - USER_GID=1000
      - GITEA__server__DOMAIN={{config.domain}}
      - GITEA__server__SSH_DOMAIN={{config.domain}}
      - GITEA__server__ROOT_URL=https://{{config.domain}}/
      - GITEA__server__SSH_PORT={{config.sshPort}}
`,
    },
    {
      id: 'binary',
      label: 'Binary Download',
      executionMethod: 'binary-download',
      binaryUrl: 'https://dl.gitea.com/gitea/latest/gitea-latest-linux-amd64',
      installCommands: [
        'chmod +x /usr/local/bin/gitea',
        'mkdir -p {{config.dataDir}}',
        'id -u git &>/dev/null || useradd --system --shell /bin/bash --create-home --home-dir /home/git git',
        'chown -R git:git {{config.dataDir}}',
      ],
      systemdTemplate: `[Unit]
Description=Gitea (Git with a cup of tea)
After=syslog.target network.target

[Service]
Type=simple
User=git
Group=git
WorkingDirectory={{config.dataDir}}
ExecStart=/usr/local/bin/gitea web --config {{config.dataDir}}/app.ini
Restart=always
RestartSec=10
Environment=USER=git HOME=/home/git GITEA_WORK_DIR={{config.dataDir}}

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

echo "==> Installing Gitea..."

GITEA_VERSION="latest"
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  armv7l) ARCH="arm-6" ;;
esac

# Download binary
echo "==> Downloading Gitea binary..."
curl -fsSL -o /usr/local/bin/gitea "https://dl.gitea.com/gitea/$GITEA_VERSION/gitea-$GITEA_VERSION-linux-$ARCH"
chmod +x /usr/local/bin/gitea

# Create user
if ! id -u git &>/dev/null; then
  echo "==> Creating git user..."
  useradd --system --shell /bin/bash --create-home --home-dir /home/git git
fi

# Create directories
mkdir -p {{config.dataDir}} {{config.dataDir}}/custom {{config.dataDir}}/log
chown -R git:git {{config.dataDir}}

echo "==> Gitea installed successfully."
`,
    },
  ],
  detection: [
    { method: 'command', value: 'gitea --version', versionCommand: 'gitea --version' },
    { method: 'docker-container', value: 'gitea' },
    { method: 'systemd-service', value: 'gitea.service' },
    { method: 'port', value: '3000' },
  ],
  nginxTemplate: `server {
    listen 80;
    server_name {{config.domain}};

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:{{config.httpPort}};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`,
  healthCheckUrl: 'http://127.0.0.1:{{config.httpPort}}/',
  version: '1.0.0',
  homepage: 'https://gitea.io',
  documentationUrl: 'https://docs.gitea.com',
};
