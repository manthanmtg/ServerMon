import { describe, expect, it } from 'vitest';
import { parseNginxServerBlocks } from './parser';

const certbotConfig = `server {
  server_name orion-test.ultron.manthanby.cv;
  client_max_body_size 32m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_read_timeout 60s;
  }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/orion-test.ultron.manthanby.cv/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/orion-test.ultron.manthanby.cv/privkey.pem; # managed by Certbot
}
server {
    if ($host = orion-test.ultron.manthanby.cv) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

  listen 80;
  server_name orion-test.ultron.manthanby.cv;
    return 404; # managed by Certbot
}`;

describe('parseNginxServerBlocks', () => {
  it('extracts Certbot-modified host details from multiple server blocks', () => {
    const blocks = parseNginxServerBlocks(certbotConfig, '/etc/nginx/servermon/orion-test.conf');

    expect(blocks).toHaveLength(2);
    const first = blocks[0];
    const second = blocks[1];
    if (!first || !second) throw new Error('expected parsed server blocks');

    expect(first).toMatchObject({
      sourcePath: '/etc/nginx/servermon/orion-test.conf',
      serverNames: ['orion-test.ultron.manthanby.cv'],
      primaryServerName: 'orion-test.ultron.manthanby.cv',
      managed: true,
      loaded: true,
      wildcard: false,
    });
    expect(first.listen?.map((entry) => entry.value)).toContain('443 ssl');
    expect(first.tls).toMatchObject({
      enabled: true,
      certificate: '/etc/letsencrypt/live/orion-test.ultron.manthanby.cv/fullchain.pem',
      certificateKey: '/etc/letsencrypt/live/orion-test.ultron.manthanby.cv/privkey.pem',
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
        server_name *.ultron.manthanby.cv;
        location / {
          proxy_pass http://127.0.0.1:9000;
        }
      }`,
      '/etc/nginx/servermon/wildcard.conf'
    );

    if (!block) throw new Error('expected wildcard server block');
    expect(block.wildcard).toBe(true);
    expect(block.primaryServerName).toBe('*.ultron.manthanby.cv');
    expect(block.locations?.[0]?.proxyPass).toBe('http://127.0.0.1:9000');
  });
});
