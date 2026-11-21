import { describe, expect, it } from 'vitest';
import { parseNginxServerBlocks } from './parser';

const certbotConfig = `server {
  server_name api-test.apps.example.com;
  client_max_body_size 32m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_read_timeout 60s;
  }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/api-test.apps.example.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/api-test.apps.example.com/privkey.pem; # managed by Certbot
}
server {
    if ($host = api-test.apps.example.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

  listen 80;
  server_name api-test.apps.example.com;
    return 404; # managed by Certbot
}`;

describe('parseNginxServerBlocks', () => {
  it('extracts Certbot-modified host details from multiple server blocks', () => {
    const blocks = parseNginxServerBlocks(certbotConfig, '/etc/nginx/servermon/app-test.conf');

    expect(blocks).toHaveLength(2);
    const first = blocks[0];
    const second = blocks[1];
    if (!first || !second) throw new Error('expected parsed server blocks');

    expect(first).toMatchObject({
      sourcePath: '/etc/nginx/servermon/app-test.conf',
      serverNames: ['api-test.apps.example.com'],
      primaryServerName: 'api-test.apps.example.com',
      managed: true,
      loaded: true,
      wildcard: false,
    });
    expect(first.listen?.map((entry) => entry.value)).toContain('443 ssl');
    expect(first.tls).toMatchObject({
      enabled: true,
      certificate: '/etc/letsencrypt/live/api-test.apps.example.com/fullchain.pem',
      certificateKey: '/etc/letsencrypt/live/api-test.apps.example.com/privkey.pem',
      certbotManaged: true,
    });
    expect(first.locations).toEqual([
      expect.objectContaining({
        path: '/',
        proxyPass: 'http://127.0.0.1:8080',
        directives: expect.objectContaining({
          proxy_read_timeout: '60s',
        }),
      }),
    ]);

    expect(second.redirects).toEqual([
      expect.objectContaining({ code: 301, target: 'https://$host$request_uri' }),
      expect.objectContaining({ code: 404 }),
    ]);
  });

  it('marks wildcard server names and keeps direct proxy details', () => {
    const [block] = parseNginxServerBlocks(
      `server {
        listen 80;
        server_name *.apps.example.com;
        location / {
          proxy_pass http://127.0.0.1:9000;
        }
      }`,
      '/etc/nginx/servermon/wildcard.conf'
    );

    if (!block) throw new Error('expected wildcard server block');
    expect(block.wildcard).toBe(true);
    expect(block.primaryServerName).toBe('*.apps.example.com');
    expect(block.locations?.[0]?.proxyPass).toBe('http://127.0.0.1:9000');
  });

  it('ignores server-looking text inside comments and quoted directives', () => {
    const blocks = parseNginxServerBlocks(
      `# server {
       #   server_name commented.example.com;
       # }
       map $http_upgrade $connection_upgrade {
         default upgrade;
         '' close;
         "server { ignored }" close;
       }
       server {
         listen 80 default_server;
         server_name real.example.com;
       }`,
      '/etc/nginx/sites-enabled/default.conf'
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.primaryServerName).toBe('real.example.com');
    expect(blocks[0]?.listen?.[0]).toMatchObject({
      port: 80,
      defaultServer: true,
    });
  });

  it('ignores commented location blocks inside real server blocks', () => {
    const [block] = parseNginxServerBlocks(
      `server {
        listen 443 ssl http2;
        server_name app.example.com;

        # location /old {
        #   proxy_pass http://127.0.0.1:3000;
        # }

        location /live {
          root /srv/app;
        }
      }`,
      '/etc/nginx/servermon/app.conf'
    );

    expect(block?.listen?.[0]).toMatchObject({
      port: 443,
      ssl: true,
      http2: true,
    });
    expect(block?.locations).toHaveLength(1);
    expect(block?.locations?.[0]).toMatchObject({
      path: '/live',
      root: '/srv/app',
    });
  });

  it('ignores location-looking text inside quoted directive values', () => {
    const [block] = parseNginxServerBlocks(
      `server {
        listen 80;
        server_name quoted.example.com;
        add_header X-Debug "location /fake { proxy_pass http://127.0.0.1:1; }";

        location /api {
          proxy_pass http://127.0.0.1:8080;
        }
      }`,
      '/etc/nginx/servermon/quoted.conf'
    );

    expect(block?.locations).toEqual([
      expect.objectContaining({
        path: '/api',
        proxyPass: 'http://127.0.0.1:8080',
      }),
    ]);
  });
});
