import { InstallTemplate, FULL_SERVICE_PIPELINE } from '../../types';

export const openwebuiTemplate: InstallTemplate = {
  id: 'openwebui',
  name: 'Open WebUI',
  description: 'User-friendly web interface for running LLMs locally with Ollama.',
  longDescription: `# Open WebUI

Open WebUI is a self-hosted web interface for interacting with large language models. It supports Ollama and OpenAI-compatible APIs.

## Features
- Chat with multiple LLM models
- Supports Ollama, OpenAI, and compatible APIs
- Document RAG (upload and chat with documents)
- Multi-user support with role-based access
- Customizable model parameters`,
  category: 'service',
  icon: 'Bot',
  tags: ['ai', 'llm', 'ollama', 'chat', 'machine-learning'],
  defaultPipeline: FULL_SERVICE_PIPELINE,
  configSchema: [
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      default: 8080,
      required: true,
      description: 'Port Open WebUI will listen on internally',
      validation: { min: 1024, max: 65535 },
    },
    {
      key: 'domain',
      label: 'Domain',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'chat.example.com',
      description: 'Domain for Nginx reverse proxy and SSL',
    },
    {
      key: 'ollamaUrl',
      label: 'Ollama API URL',
      type: 'string',
      default: 'http://host.docker.internal:11434',
      required: false,
      placeholder: 'http://localhost:11434',
      description: 'URL of the Ollama API server',
    },
    {
      key: 'dataDir',
      label: 'Data Directory',
      type: 'string',
      default: '/opt/open-webui/data',
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
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    container_name: open-webui
    restart: unless-stopped
    ports:
      - "127.0.0.1:{{config.port}}:8080"
    volumes:
      - "{{config.dataDir}}:/app/backend/data"
    environment:
      - OLLAMA_BASE_URL={{config.ollamaUrl}}
    extra_hosts:
      - "host.docker.internal:host-gateway"
`,
    },
    {
      id: 'script',
      label: 'Install Script',
      executionMethod: 'script',
      installScript: `#!/bin/bash
set -euo pipefail

echo "==> Installing Open WebUI via Docker..."

# Pull the latest image
docker pull ghcr.io/open-webui/open-webui:main

# Create data directory
mkdir -p {{config.dataDir}}

# Run the container
docker run -d \\
  --name open-webui \\
  --restart unless-stopped \\
  -p 127.0.0.1:{{config.port}}:8080 \\
  -v {{config.dataDir}}:/app/backend/data \\
  -e OLLAMA_BASE_URL={{config.ollamaUrl}} \\
  --add-host host.docker.internal:host-gateway \\
  ghcr.io/open-webui/open-webui:main

echo "==> Open WebUI installed successfully."
`,
    },
  ],
  detection: [
    { method: 'docker-container', value: 'open-webui' },
    { method: 'port', value: '8080' },
  ],
  nginxTemplate: `server {
    listen 80;
    server_name {{config.domain}};

    client_max_body_size 50M;

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
        proxy_read_timeout 300s;
    }
}
`,
  healthCheckUrl: 'http://127.0.0.1:{{config.port}}/',
  version: '1.0.0',
  homepage: 'https://openwebui.com',
  documentationUrl: 'https://docs.openwebui.com',
};
