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
  server_name orion-servermon.ultron.manthanby.cv;
  ssl_certificate /etc/letsencrypt/live/orion-servermon.ultron.manthanby.cv/fullchain.pem;
  location / {
    proxy_pass http://127.0.0.1:8080;
  }
}`;

function mockExecSuccess(stdout: string, stderr = ''): void {
  vi.mocked(execFile).mockImplementation(
    (_cmd, _args, _opts, callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
      if (callback) callback(null, { stdout, stderr });
      return null as never;
    }
  );
}

function mockExecFailure(message: string): void {
  vi.mocked(execFile).mockImplementation(
    (_cmd, _args, _opts, callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
      const error = new Error(message);
      if (callback) callback(error, { stdout: '', stderr: message });
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
    mockExecSuccess(`# configuration file /etc/nginx/servermon/orion-servermon.conf:
${servermonConfig}
`);

    const { discoverNginxVirtualHosts } = await import('./discovery');
    const vhosts = await discoverNginxVirtualHosts();

    expect(vhosts).toHaveLength(1);
    expect(vhosts[0]).toMatchObject({
      sourcePath: '/etc/nginx/servermon/orion-servermon.conf',
      loaded: true,
      managed: true,
      primaryServerName: 'orion-servermon.ultron.manthanby.cv',
      proxyPass: 'http://127.0.0.1:8080',
    });
  });

  it('falls back to all common config directories including /etc/nginx/servermon', async () => {
    mockExecFailure('nginx -T failed');
    vi.mocked(readdir).mockImplementation(async (path) => {
      if (String(path) === '/etc/nginx/sites-available') return ['default'] as never;
      if (String(path) === '/etc/nginx/servermon') return ['orion-servermon.conf'] as never;
      return [] as never;
    });
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path) === '/etc/nginx/servermon/orion-servermon.conf') {
        return servermonConfig;
      }
      return 'server { listen 80; server_name default; }';
    });

    const { discoverNginxVirtualHosts } = await import('./discovery');
    const vhosts = await discoverNginxVirtualHosts();

    expect(vhosts.map((vhost) => vhost.sourcePath)).toContain(
      '/etc/nginx/servermon/orion-servermon.conf'
    );
    expect(vhosts.find((vhost) => vhost.sourcePath?.includes('/servermon/'))?.managed).toBe(true);
  });
});
