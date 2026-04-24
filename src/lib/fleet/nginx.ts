import type { IPublicRouteDTO } from '@/models/PublicRoute';

export interface NginxRenderOpts {
  frpsVhostPort: number;
  accessPolicy?: { ipAllowlist?: string[] };
}

export type NginxRenderRoute = Pick<
  IPublicRouteDTO,
  | 'domain'
  | 'path'
  | 'tlsEnabled'
  | 'http2Enabled'
  | 'websocketEnabled'
  | 'maxBodyMb'
  | 'timeoutSeconds'
  | 'compression'
  | 'accessMode'
  | 'headers'
  | 'slug'
>;

export function renderServerBlock(route: NginxRenderRoute, opts: NginxRenderOpts): string {
  if (route.domain.startsWith('*')) {
    throw new Error(`Refusing to render server block for unsafe wildcard domain: ${route.domain}`);
  }

  const lines: string[] = [];

  if (route.tlsEnabled) {
    // HTTP -> HTTPS redirect server block
    lines.push('server {');
    lines.push('  listen 80;');
    lines.push(`  server_name ${route.domain};`);
    lines.push('  return 301 https://$host$request_uri;');
    lines.push('}');
    lines.push('');
  }

  lines.push('server {');
  lines.push('  listen 80;');
  if (route.tlsEnabled) {
    lines.push('  listen 443 ssl;');
    if (route.http2Enabled) {
      lines.push('  http2 on;');
    }
    lines.push(`  ssl_certificate /etc/letsencrypt/live/${route.domain}/fullchain.pem;`);
    lines.push(`  ssl_certificate_key /etc/letsencrypt/live/${route.domain}/privkey.pem;`);
    lines.push(
      '  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
    );
  }
  lines.push(`  server_name ${route.domain};`);
  lines.push(`  client_max_body_size ${route.maxBodyMb}m;`);

  if (route.compression) {
    lines.push('  gzip on;');
    lines.push('  gzip_proxied any;');
    lines.push(
      '  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;'
    );
    lines.push('  gzip_vary on;');
  }

  for (const [k, v] of Object.entries(route.headers || {})) {
    lines.push(`  add_header ${k} ${v};`);
  }

  lines.push(`  location ${route.path} {`);

  if (route.accessMode === 'basic_auth') {
    lines.push('    auth_basic "Restricted";');
    lines.push(`    auth_basic_user_file /etc/nginx/servermon/${route.slug}.htpasswd;`);
  }

  if (route.accessMode === 'ip_allowlist') {
    const ips = opts.accessPolicy?.ipAllowlist ?? [];
    for (const ip of ips) {
      lines.push(`    allow ${ip};`);
    }
    lines.push('    deny all;');
  }

  lines.push(`    proxy_pass http://127.0.0.1:${opts.frpsVhostPort};`);
  lines.push('    proxy_set_header Host $host;');
  lines.push('    proxy_set_header X-Real-IP $remote_addr;');
  lines.push('    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
  lines.push('    proxy_set_header X-Forwarded-Proto $scheme;');
  lines.push(`    proxy_read_timeout ${route.timeoutSeconds}s;`);

  if (route.websocketEnabled) {
    lines.push('    proxy_http_version 1.1;');
    lines.push('    proxy_set_header Upgrade $http_upgrade;');
    lines.push('    proxy_set_header Connection "upgrade";');
  }

  lines.push('  }');
  lines.push('}');

  return lines.join('\n') + '\n';
}
