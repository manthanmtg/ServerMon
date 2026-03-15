/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}));

vi.mock('child_process', () => ({ exec: mockExec }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/modules/disk/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/modules/disk/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: mock exec to call callback with stdout
    mockExec.mockImplementation(
      (
        _cmd: string,
        callback: (err: Error | null, result: { stdout: string; stderr: string }) => void
      ) => {
        callback(null, { stdout: '1024\t/var/log\n512\t/var/cache\n', stderr: '' });
      }
    );
  });

  it('returns 400 for path with semicolon', async () => {
    const res = await POST(makeRequest({ path: '/tmp; rm -rf /' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid path');
  });

  it('returns 400 for path with ampersand', async () => {
    const res = await POST(makeRequest({ path: '/tmp & whoami' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid path');
  });

  it('returns 400 for path with pipe', async () => {
    const res = await POST(makeRequest({ path: '/tmp | cat /etc/passwd' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-string path', async () => {
    const res = await POST(makeRequest({ path: 123 }));
    expect(res.status).toBe(400);
  });

  it('returns scan results on success', async () => {
    mockExec.mockImplementation(
      (
        _cmd: string,
        callback: (err: Error | null, result: { stdout: string; stderr: string }) => void
      ) => {
        callback(null, { stdout: '2048\t/var/log\n1024\t/var/cache\n', stderr: '' });
      }
    );
    const res = await POST(makeRequest({ path: '/var' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toHaveLength(2);
    expect(json.results[0].name).toBe('log');
    expect(json.results[0].size).toBe(2048 * 1024);
  });

  it('uses / as default path when not specified', async () => {
    mockExec.mockImplementation(
      (
        _cmd: string,
        callback: (err: Error | null, result: { stdout: string; stderr: string }) => void
      ) => {
        callback(null, { stdout: '100\t/bin\n', stderr: '' });
      }
    );
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
  });

  it('returns 500 on exec error', async () => {
    mockExec.mockImplementation(
      (
        _cmd: string,
        callback: (err: Error | null, result: { stdout: string; stderr: string }) => void
      ) => {
        callback(new Error('exec failed'), { stdout: '', stderr: '' });
      }
    );
    const res = await POST(makeRequest({ path: '/tmp' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to scan directories');
  });
});
