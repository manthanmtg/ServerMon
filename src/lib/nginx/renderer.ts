export type ManagedTlsMode = 'none' | 'existing';

export interface ManagedServerBlockInput {
  domainPattern: string;
  upstreamProtocol: 'http' | 'https';
  upstreamHost: string;
  upstreamPort: number;
  redirectHttp: boolean;
  websocket: boolean;
  tlsMode: ManagedTlsMode;
  certificatePath?: string;
  certificateKeyPath?: string;
  maxBodyMb: number;
  timeoutSeconds: number;
  headers: Record<string, string>;
}

const FILE_NAME_RE = /^[a-z0-9][a-z0-9.-]*\.conf$/;
const DOMAIN_RE =
  /^(\*\.)?[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const HOST_RE = /^[A-Za-z0-9_.:-]+$/;
const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export function validateManagedFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!FILE_NAME_RE.test(trimmed) || trimmed.includes('..') || trimmed.includes('/')) {
    throw new Error('Invalid managed config file name');
  }
  return trimmed;
}

function validateDomainPattern(domainPattern: string): string {
  const trimmed = domainPattern.trim().toLowerCase();
  if (!DOMAIN_RE.test(trimmed)) {
    throw new Error('Invalid nginx server name');
  }
  return trimmed;
}

function validateUpstreamHost(host: string): string {
  const trimmed = host.trim();
  if (!HOST_RE.test(trimmed)) {
    throw new Error('Invalid upstream host');
  }
  return trimmed;
}

function addHeaders(lines: string[], headers: Record<string, string>): void {
  for (const [name, rawValue] of Object.entries(headers)) {
    if (!HEADER_NAME_RE.test(name)) {
      throw new Error(`Invalid response header name: ${name}`);
    }
    const value = String(rawValue)
      .replace(/[\r\n]/g, ' ')
      .trim();
    if (!value) continue;
    lines.push(`  add_header ${name} ${value};`);
  }
}

export function renderManagedServerBlock(input: ManagedServerBlockInput): string {
  const domain = validateDomainPattern(input.domainPattern);
  const upstreamHost = validateUpstreamHost(input.upstreamHost);
  const port = Math.trunc(input.upstreamPort);
  if (port < 1 || port > 65535) throw new Error('Invalid upstream port');
  if (input.maxBodyMb < 1 || input.maxBodyMb > 1024) throw new Error('Invalid max body size');
  if (input.timeoutSeconds < 1 || input.timeoutSeconds > 3600) throw new Error('Invalid timeout');
  if (input.tlsMode === 'existing' && (!input.certificatePath || !input.certificateKeyPath)) {
    throw new Error('Existing TLS mode requires certificate and key paths');
  }

  const lines: string[] = [];

  if (input.redirectHttp && input.tlsMode !== 'none') {
    lines.push('server {');
    lines.push('  listen 80;');
    lines.push(`  server_name ${domain};`);
    lines.push('  return 301 https://$host$request_uri;');
    lines.push('}');
    lines.push('');
  }

  lines.push('server {');
  lines.push(input.tlsMode === 'none' ? '  listen 80;' : '  listen 443 ssl;');
  lines.push(`  server_name ${domain};`);
  if (input.tlsMode === 'existing') {
    lines.push(`  ssl_certificate ${input.certificatePath};`);
    lines.push(`  ssl_certificate_key ${input.certificateKeyPath};`);
  }
  lines.push(`  client_max_body_size ${Math.trunc(input.maxBodyMb)}m;`);
  addHeaders(lines, input.headers);
  lines.push('');
  lines.push('  location / {');
  lines.push(`    proxy_pass ${input.upstreamProtocol}://${upstreamHost}:${port};`);
  lines.push('    proxy_set_header Host $host;');
  lines.push('    proxy_set_header X-Real-IP $remote_addr;');
  lines.push('    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
  lines.push('    proxy_set_header X-Forwarded-Proto $scheme;');
  lines.push(`    proxy_read_timeout ${Math.trunc(input.timeoutSeconds)}s;`);
  if (input.websocket) {
    lines.push('    proxy_http_version 1.1;');
    lines.push('    proxy_set_header Upgrade $http_upgrade;');
    lines.push('    proxy_set_header Connection "upgrade";');
  }
  lines.push('  }');
  lines.push('}');

  return `${lines.join('\n')}\n`;
}
