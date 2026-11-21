/** @vitest-environment node */
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

const servermonConfig = `server {
  listen 443 ssl;
  server_name servermon.apps.example.com;
  ssl_certificate /etc/letsencrypt/live/servermon.apps.example.com/fullchain.pem;
  location / {
    proxy_pass http://127.0.0.1:8080;
  }
}`;

function mockExecSuccess(stdout: string, stderr = ''): void {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_cmd: unknown, _args: unknown, opts: unknown, callback: unknown) => {
      const cb = (typeof opts === 'function' ? opts : callback) as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      cb(null, { stdout, stderr });
      return null as never;
    }
  );
}

function mockExecFailure(message: string): void {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_cmd: unknown, _args: unknown, opts: unknown, callback: unknown) => {
      const cb = (typeof opts === 'function' ? opts : callback) as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      const error = new Error(message);
      cb(error, { stdout: '', stderr: message });
      return null as never;
    }
  );
}

describe('discoverNginxVirtualHosts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('discovers loaded server blocks from nginx -T source file markers', async () => {
    mockExecSuccess(`# configuration file /etc/nginx/servermon/servermon-app.conf:
${servermonConfig}
`);

    const { discoverNginxVirtualHosts } = await import('./discovery');
    const vhosts = await discoverNginxVirtualHosts();

    expect(vhosts).toHaveLength(1);
    expect(vhosts[0]).toMatchObject({
      sourcePath: '/etc/nginx/servermon/servermon-app.conf',
      loaded: true,
      managed: true,
      primaryServerName: 'servermon.apps.example.com',
      proxyPass: 'http://127.0.0.1:8080',
    });
  });

  it('falls back to all common config directories including /etc/nginx/servermon', async () => {
    mockExecFailure('nginx -T failed');
    vi.mocked(readdir).mockImplementation(async (path) => {
      if (String(path) === '/etc/nginx/sites-available') return ['default'] as never;
      if (String(path) === '/etc/nginx/servermon') return ['servermon-app.conf'] as never;
      return [] as never;
    });
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path) === '/etc/nginx/servermon/servermon-app.conf') {
        return servermonConfig;
      }
      return 'server { listen 80; server_name default; }';
    });

    const { discoverNginxVirtualHosts } = await import('./discovery');
    const vhosts = await discoverNginxVirtualHosts();

    expect(vhosts.map((vhost) => vhost.sourcePath)).toContain(
      '/etc/nginx/servermon/servermon-app.conf'
    );
    expect(vhosts.find((vhost) => vhost.sourcePath?.includes('/servermon/'))?.managed).toBe(true);
  });
});
