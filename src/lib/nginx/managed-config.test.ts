/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { writeManagedConfig } from './managed-config';

describe('writeManagedConfig', () => {
  it('writes a managed file after a successful nginx config test', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const result = await writeManagedConfig(
      { fileName: 'app.conf', content: 'server { listen 80; server_name app.example.com; }' },
      {
        managedDir: '/etc/nginx/servermon',
        mkdir: vi.fn(),
        readFile: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
        writeFile: vi.fn(async (path: string, content: string) => {
          writes.push({ path, content });
        }),
        unlink: vi.fn(),
        testConfig: vi.fn(async () => ({ success: true, output: 'syntax is ok' })),
      }
    );

    expect(result.ok).toBe(true);
    expect(result.path).toBe('/etc/nginx/servermon/app.conf');
    expect(writes).toEqual([
      {
        path: '/etc/nginx/servermon/app.conf',
        content: 'server { listen 80; server_name app.example.com; }',
      },
    ]);
  });

  it('rolls back to the previous content when nginx config test fails', async () => {
    const writeFile = vi.fn(async () => undefined);

    const result = await writeManagedConfig(
      { fileName: 'app.conf', content: 'broken config' },
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
    expect(writeFile).toHaveBeenNthCalledWith(
      1,
      '/etc/nginx/servermon/app.conf',
      'broken config',
      'utf-8'
    );
    expect(writeFile).toHaveBeenNthCalledWith(
      2,
      '/etc/nginx/servermon/app.conf',
      'previous config',
      'utf-8'
    );
  });
});
