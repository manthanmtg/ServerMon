import type { DnsInstructions } from '@/modules/apps/types';

const SECRET_KEY_PATTERN =
  /(secret|token|password|passwd|api[_-]?key|private|credential|database_url)/i;
const PUBLIC_KEY_PATTERN = /^NEXT_PUBLIC_/;

export function sanitizeAppSlug(value: string): string {
  if (value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new Error('App slug must start and end with a letter or number');
  }

  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    throw new Error('App slug must start and end with a letter or number');
  }

  return slug;
}

export function createReleaseId(date = new Date()): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    '-',
    pad(date.getUTCMilliseconds(), 3),
  ].join('');
}

export function maskEnvVars(envVars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(envVars).map(([key, value]) => [
      key,
      SECRET_KEY_PATTERN.test(key) && !PUBLIC_KEY_PATTERN.test(key) ? '***' : value,
    ])
  );
}

export function toSystemdServiceName(appSlug: string): string {
  return `servermon-app-${sanitizeAppSlug(appSlug)}.service`;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

export function renderEnvFile(envVars: Record<string, string>, port: number): string {
  const lines = Object.entries({ ...envVars, PORT: String(port) })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${shellSingleQuote(value)}`);
  return `${lines.join('\n')}\n`;
}

export function buildSystemdUnit({
  appSlug,
  appRoot,
  command,
  runAsUser,
  port,
}: {
  appSlug: string;
  appRoot: string;
  command: string;
  runAsUser?: string;
  port: number;
}): string {
  const userLine = runAsUser ? `User=${runAsUser}\n` : '';

  return `[Unit]
Description=ServerMon managed app ${sanitizeAppSlug(appSlug)}
After=network.target

[Service]
Type=simple
WorkingDirectory=${appRoot}/current/source
EnvironmentFile=${appRoot}/current/env
Environment=PORT=${port}
${userLine}ExecStart=/bin/sh -lc ${shellSingleQuote(command)}
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
`;
}

interface NginxTlsConfig {
  certificatePath: string;
  certificateKeyPath: string;
}

function renderProxyLocation(port: number): string {
  return `  location / {
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_cache_bypass $http_upgrade;
  }
`;
}

export function buildNginxConfig({
  domain,
  port,
  tls,
}: {
  domain: string;
  port: number;
  tls?: NginxTlsConfig;
}): string {
  if (tls) {
    return `server {
  listen 80;
  server_name ${domain};
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name ${domain};

  ssl_certificate ${tls.certificatePath};
  ssl_certificate_key ${tls.certificateKeyPath};
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

${renderProxyLocation(port)}
}
`;
  }

  return `server {
  listen 80;
  server_name ${domain};

${renderProxyLocation(port)}
}
`;
}

export function buildDnsInstructions(domain: string, publicIp: string): DnsInstructions {
  const parts = domain.split('.');
  const name = parts.length > 2 ? parts.slice(0, -2).join('.') : '@';

  return {
    type: 'A',
    name,
    value: publicIp,
    summary: `Create A record: ${domain} -> ${publicIp}`,
  };
}
