import { describe, expect, it } from 'vitest';
import { renderManagedServerBlock, validateManagedFileName } from './renderer';

describe('renderManagedServerBlock', () => {
  it('renders a direct host reverse proxy with websocket and TLS details', () => {
    const rendered = renderManagedServerBlock({
      domainPattern: 'app.example.com',
      upstreamProtocol: 'http',
      upstreamHost: '127.0.0.1',
      upstreamPort: 8912,
      redirectHttp: true,
      websocket: true,
      tlsMode: 'existing',
      certificatePath: '/etc/letsencrypt/live/app.example.com/fullchain.pem',
      certificateKeyPath: '/etc/letsencrypt/live/app.example.com/privkey.pem',
      maxBodyMb: 64,
      timeoutSeconds: 300,
      headers: { 'X-Frame-Options': 'DENY' },
    });

    expect(rendered).toContain('server_name app.example.com;');
    expect(rendered).toContain('return 301 https://$host$request_uri;');
    expect(rendered).toContain('listen 443 ssl;');
    expect(rendered).toContain(
      'ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;'
    );
    expect(rendered).toContain('proxy_pass http://127.0.0.1:8912;');
    expect(rendered).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(rendered).toContain('client_max_body_size 64m;');
    expect(rendered).toContain('proxy_read_timeout 300s;');
    expect(rendered).toContain('add_header X-Frame-Options DENY;');
  });

  it('renders wildcard hosts without requiring TLS certificate paths', () => {
    const rendered = renderManagedServerBlock({
      domainPattern: '*.apps.example.com',
      upstreamProtocol: 'http',
      upstreamHost: '127.0.0.1',
      upstreamPort: 8080,
      redirectHttp: false,
      websocket: false,
      tlsMode: 'none',
      maxBodyMb: 32,
      timeoutSeconds: 60,
      headers: {},
    });

    expect(rendered).toContain('server_name *.apps.example.com;');
    expect(rendered).toContain('listen 80;');
    expect(rendered).not.toContain('ssl_certificate');
  });
});

describe('validateManagedFileName', () => {
  it('accepts safe conf names and rejects traversal', () => {
    expect(validateManagedFileName('app.conf')).toBe('app.conf');
    expect(() => validateManagedFileName('../app.conf')).toThrow(
      'Invalid managed config file name'
    );
    expect(() => validateManagedFileName('app')).toThrow('Invalid managed config file name');
  });
});
