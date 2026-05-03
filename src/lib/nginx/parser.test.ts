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
    expect(blocks[0]).toMatchObject({
      sourcePath: '/etc/nginx/servermon/orion-test.conf',
      serverNames: ['orion-test.ultron.manthanby.cv'],
      primaryServerName: 'orion-test.ultron.manthanby.cv',
      managed: true,
      loaded: true,
      wildcard: false,
    });
    expect(blocks[0].listen.map((entry) => entry.value)).toContain('443 ssl');
    expect(blocks[0].tls).toMatchObject({
      enabled: true,
      certificate: '/etc/letsencrypt/live/orion-test.ultron.manthanby.cv/fullchain.pem',
      certificateKey: '/etc/letsencrypt/live/orion-test.ultron.manthanby.cv/privkey.pem',
      certbotManaged: true,
    });
    expect(blocks[0].locations).toEqual([
      expect.objectContaining({
        path: '/',
        proxyPass: 'http://127.0.0.1:8080',
        directives: expect.objectContaining({
          proxy_read_timeout: '60s',
        }),
      }),
    ]);

    expect(blocks[1].redirects).toEqual([
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

    expect(block.wildcard).toBe(true);
    expect(block.primaryServerName).toBe('*.ultron.manthanby.cv');
    expect(block.locations[0].proxyPass).toBe('http://127.0.0.1:9000');
  });
});
