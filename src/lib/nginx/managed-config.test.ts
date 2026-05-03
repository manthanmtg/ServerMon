/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { writeManagedConfig } from './managed-config';

describe('writeManagedConfig', () => {
  it('writes a managed file after a successful nginx config test', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const result = await writeManagedConfig(
      { fileName: 'life.conf', content: 'server { listen 80; server_name life.manthanby.cv; }' },
      {
        managedDir: '/etc/nginx/servermon',
        mkdir: vi.fn(),
        readFile: vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
        writeFile: vi.fn(async (path: string, content: string) => {
          writes.push({ path, content });
        }),
        unlink: vi.fn(),
        testConfig: vi.fn(async () => ({ success: true, output: 'syntax is ok' })),
      }
    );

    expect(result.ok).toBe(true);
    expect(result.path).toBe('/etc/nginx/servermon/life.conf');
    expect(writes).toEqual([
      {
        path: '/etc/nginx/servermon/life.conf',
        content: 'server { listen 80; server_name life.manthanby.cv; }',
      },
    ]);
  });

  it('rolls back to the previous content when nginx config test fails', async () => {
    const writeFile = vi.fn(async () => undefined);

    const result = await writeManagedConfig(
      { fileName: 'life.conf', content: 'broken config' },
      {
        managedDir: '/etc/nginx/servermon',
        mkdir: vi.fn(),
        readFile: vi.fn(async () => 'previous config'),
        writeFile,
        unlink: vi.fn(),
        testConfig: vi.fn(async () => ({ success: false, output: 'syntax error' })),
      }
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe('syntax error');
    expect(writeFile).toHaveBeenNthCalledWith(1, '/etc/nginx/servermon/life.conf', 'broken config', 'utf-8');
    expect(writeFile).toHaveBeenNthCalledWith(2, '/etc/nginx/servermon/life.conf', 'previous config', 'utf-8');
  });
});
