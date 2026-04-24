import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { platformTriple, frpDownloadUrl, verifyChecksum, ensureBinary } from './binary';

describe('platformTriple', () => {
  it('maps darwin/x64 to darwin_amd64', () => {
    expect(platformTriple({ platform: 'darwin', arch: 'x64' })).toBe('darwin_amd64');
  });
  it('maps darwin/arm64 to darwin_arm64', () => {
    expect(platformTriple({ platform: 'darwin', arch: 'arm64' })).toBe('darwin_arm64');
  });
  it('maps linux/x64 to linux_amd64', () => {
    expect(platformTriple({ platform: 'linux', arch: 'x64' })).toBe('linux_amd64');
  });
  it('maps linux/arm64 to linux_arm64', () => {
    expect(platformTriple({ platform: 'linux', arch: 'arm64' })).toBe('linux_arm64');
  });
  it('maps win32/x64 to windows_amd64', () => {
    expect(platformTriple({ platform: 'win32', arch: 'x64' })).toBe('windows_amd64');
  });
  it('maps win32/arm64 to windows_arm64', () => {
    expect(platformTriple({ platform: 'win32', arch: 'arm64' })).toBe('windows_arm64');
  });
  it('throws on unsupported platform', () => {
    expect(() => platformTriple({ platform: 'freebsd' as NodeJS.Platform, arch: 'x64' })).toThrow(
      /Unsupported platform/
    );
  });
  it('throws on unsupported arch', () => {
    expect(() => platformTriple({ platform: 'linux', arch: 'ia32' })).toThrow(/Unsupported arch/);
  });
});

describe('frpDownloadUrl', () => {
  it('produces exact URL format', () => {
    expect(frpDownloadUrl('0.58.0', 'linux_amd64')).toBe(
      'https://github.com/fatedier/frp/releases/download/v0.58.0/frp_0.58.0_linux_amd64.tar.gz'
    );
  });
  it('handles darwin_arm64', () => {
    expect(frpDownloadUrl('0.61.2', 'darwin_arm64')).toBe(
      'https://github.com/fatedier/frp/releases/download/v0.61.2/frp_0.61.2_darwin_arm64.tar.gz'
    );
  });
});

describe('verifyChecksum', () => {
  // sha256('hello') = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
  const helloSha = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

  it('returns true for matching sha256', async () => {
    const readFile = async () => Buffer.from('hello');
    expect(await verifyChecksum('/any', helloSha, readFile)).toBe(true);
  });
  it('returns false for non-matching sha256', async () => {
    const readFile = async () => Buffer.from('hello');
    expect(await verifyChecksum('/any', 'deadbeef', readFile)).toBe(false);
  });
  it('accepts uppercase expected hex', async () => {
    const readFile = async () => Buffer.from('hello');
    expect(await verifyChecksum('/any', helloSha.toUpperCase(), readFile)).toBe(true);
  });
});

describe('ensureBinary', () => {
  it('skips download when cached', async () => {
    const fetchImpl = vi.fn();
    const spawnImpl = vi.fn();
    const fsImpl = {
      existsSync: () => true,
      mkdirSync: vi.fn(),
      writeFile: vi.fn(),
    };
    const r = await ensureBinary({
      cacheDir: '/tmp/c',
      version: '0.58.0',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      fsImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(fsImpl.mkdirSync).not.toHaveBeenCalled();
    expect(r.frps).toMatch(/frps$/);
    expect(r.frpc).toMatch(/frpc$/);
    expect(r.frps).toContain('/tmp/c');
    expect(r.frps).toContain('0.58.0');
  });

  it('downloads when missing', async () => {
    const tarball = Buffer.from('tar');
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => tarball.buffer.slice(0),
    });
    const spawnImpl = vi.fn((_cmd: string, _args: readonly string[]) => {
      const proc = new EventEmitter() as EventEmitter & { pid?: number };
      setImmediate(() => proc.emit('exit', 0));
      return proc;
    });
    const fsImpl = {
      existsSync: () => false,
      mkdirSync: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };
    const r = await ensureBinary({
      cacheDir: '/tmp/c',
      version: '0.58.0',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      fsImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toMatch(/fatedier\/frp\/releases\/download\/v0\.58\.0\//);
    expect(fsImpl.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('0.58.0'), {
      recursive: true,
    });
    expect(fsImpl.writeFile).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenData] = fsImpl.writeFile.mock.calls[0];
    expect(writtenPath).toMatch(/\.tar\.gz$/);
    expect(writtenData).toBeInstanceOf(Buffer);
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnImpl.mock.calls[0];
    expect(cmd).toBe('tar');
    expect(args).toContain('-xzf');
    expect(args).toContain('-C');
    expect(args).toContain('--strip-components=1');
    expect(r.frps).toMatch(/frps$/);
    expect(r.frpc).toMatch(/frpc$/);
  });

  it('throws when fetch response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const spawnImpl = vi.fn();
    const fsImpl = {
      existsSync: () => false,
      mkdirSync: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      ensureBinary({
        cacheDir: '/tmp/c',
        version: '0.58.0',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
        fsImpl,
      })
    ).rejects.toThrow(/Failed to download FRP/);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('rejects when tar exits non-zero', async () => {
    const tarball = Buffer.from('tar');
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => tarball.buffer.slice(0),
    });
    const spawnImpl = vi.fn((_cmd: string, _args: readonly string[]) => {
      const proc = new EventEmitter();
      setImmediate(() => proc.emit('exit', 2));
      return proc;
    });
    const fsImpl = {
      existsSync: () => false,
      mkdirSync: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      ensureBinary({
        cacheDir: '/tmp/c',
        version: '0.58.0',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
        fsImpl,
      })
    ).rejects.toThrow(/tar exited with code 2/);
  });
});
