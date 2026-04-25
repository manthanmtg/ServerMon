import { describe, it, expect } from 'vitest';
import { renderServerBlock } from './nginx';
import type { IPublicRouteDTO } from '@/models/PublicRoute';

type RouteInput = Pick<
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

function baseRoute(over: Partial<RouteInput> = {}): RouteInput {
  return {
    slug: 'photos',
    domain: 'photos.example.com',
    path: '/',
    tlsEnabled: false,
    http2Enabled: true,
    websocketEnabled: false,
    maxBodyMb: 32,
    timeoutSeconds: 60,
    compression: false,
    accessMode: 'public',
    headers: {},
    ...over,
  };
}

describe('renderServerBlock', () => {
  it('renders minimal HTTP-only block', () => {
    const out = renderServerBlock(baseRoute(), { frpsVhostPort: 8080 });
    expect(out).toContain('listen 80;');
    expect(out).toContain('server_name photos.example.com;');
    expect(out).toContain('location / {');
    expect(out).toContain('proxy_pass http://127.0.0.1:8080;');
    expect(out).toContain('proxy_set_header Host $host;');
    expect(out).toContain('proxy_set_header X-Real-IP $remote_addr;');
    expect(out).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    expect(out).toContain('proxy_set_header X-Forwarded-Proto $scheme;');
    expect(out).toContain('client_max_body_size 32m;');
    expect(out).toContain('proxy_read_timeout 60s;');
    // No TLS indicators
    expect(out).not.toContain('ssl_certificate');
    expect(out).not.toContain('listen 443');
    expect(out).not.toContain('Strict-Transport-Security');
    expect(out).not.toContain('return 301 https://');
  });

  it('emits TLS listen + cert + redirect + HSTS when tlsEnabled with http2', () => {
    const out = renderServerBlock(baseRoute({ tlsEnabled: true, http2Enabled: true }), {
      frpsVhostPort: 8080,
    });
    expect(out).toContain('listen 443 ssl http2;');
    expect(out).toContain(
      'ssl_certificate /etc/letsencrypt/live/photos.example.com/fullchain.pem;'
    );
    expect(out).toContain(
      'ssl_certificate_key /etc/letsencrypt/live/photos.example.com/privkey.pem;'
    );
    expect(out).toContain('Strict-Transport-Security');
    // Redirect server present
    expect(out).toContain('return 301 https://$host$request_uri;');
  });

  it('emits TLS without http2 when http2Enabled false', () => {
    const out = renderServerBlock(baseRoute({ tlsEnabled: true, http2Enabled: false }), {
      frpsVhostPort: 8080,
    });
    expect(out).toContain('listen 443 ssl;');
    expect(out).not.toContain('listen 443 ssl http2;');
  });

  it('emits websocket directives when websocketEnabled', () => {
    const out = renderServerBlock(baseRoute({ websocketEnabled: true, timeoutSeconds: 120 }), {
      frpsVhostPort: 8080,
    });
    expect(out).toContain('proxy_http_version 1.1;');
    expect(out).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(out).toContain('proxy_set_header Connection "upgrade";');
    expect(out).toContain('proxy_read_timeout 120s;');
  });

  it('emits basic_auth directives when accessMode basic_auth', () => {
    const out = renderServerBlock(baseRoute({ accessMode: 'basic_auth' }), { frpsVhostPort: 8080 });
    expect(out).toContain('auth_basic "Restricted";');
    expect(out).toContain('auth_basic_user_file /etc/nginx/servermon/photos.htpasswd;');
  });

  it('emits allow/deny for ip_allowlist', () => {
    const out = renderServerBlock(baseRoute({ accessMode: 'ip_allowlist' }), {
      frpsVhostPort: 8080,
      accessPolicy: { ipAllowlist: ['10.0.0.1', '192.168.1.0/24'] },
    });
    expect(out).toContain('allow 10.0.0.1;');
    expect(out).toContain('allow 192.168.1.0/24;');
    expect(out).toContain('deny all;');
  });

  it('emits compression directives when compression enabled', () => {
    const out = renderServerBlock(baseRoute({ compression: true }), { frpsVhostPort: 8080 });
    expect(out).toContain('gzip on;');
  });

  it('emits custom response headers', () => {
    const out = renderServerBlock(
      baseRoute({
        headers: {
          'X-Frame-Options': 'DENY',
          'X-Custom': 'foo',
        },
      }),
      { frpsVhostPort: 8080 }
    );
    expect(out).toContain('add_header X-Frame-Options DENY;');
    expect(out).toContain('add_header X-Custom foo;');
  });

  it('rejects unsafe wildcard server_name', () => {
    expect(() =>
      renderServerBlock(baseRoute({ domain: '*.example.com' }), {
        frpsVhostPort: 8080,
      })
    ).toThrow();
  });
});
