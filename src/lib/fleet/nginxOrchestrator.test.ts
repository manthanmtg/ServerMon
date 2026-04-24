import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NginxOrchestrator, type NginxOrchestratorDeps } from './nginxOrchestrator';

interface NginxStateLike {
  managedDir?: string;
  managedServerNames?: string[];
}

function makeDeps(
  partial: Partial<NginxOrchestratorDeps> & { stateDoc?: NginxStateLike | null } = {}
): {
  deps: NginxOrchestratorDeps;
  logs: Array<Parameters<NonNullable<NginxOrchestratorDeps['logEntry']>>[0]>;
  findOneMock: ReturnType<typeof vi.fn>;
  findOneAndUpdateMock: ReturnType<typeof vi.fn>;
  nginxTestMock: ReturnType<typeof vi.fn>;
  nginxReloadMock: ReturnType<typeof vi.fn>;
  writeFileMock: ReturnType<typeof vi.fn>;
  unlinkMock: ReturnType<typeof vi.fn>;
  mkdirMock: ReturnType<typeof vi.fn>;
  fleetLogCreateMock: ReturnType<typeof vi.fn>;
} {
  const logs: Array<Parameters<NonNullable<NginxOrchestratorDeps['logEntry']>>[0]> = [];
  const stateDoc =
    'stateDoc' in partial
      ? partial.stateDoc
      : { managedDir: '/etc/nginx/conf.d/servermon', managedServerNames: [] };

  const findOneMock = vi.fn().mockReturnValue({
    lean: vi.fn().mockResolvedValue(stateDoc),
  });
  const findOneAndUpdateMock = vi.fn().mockResolvedValue(null);
  const nginxTestMock = vi.fn().mockResolvedValue({ ok: true, stderr: '' });
  const nginxReloadMock = vi.fn().mockResolvedValue({ ok: true, stderr: '' });
  const writeFileMock = vi.fn().mockResolvedValue(undefined);
  const unlinkMock = vi.fn().mockResolvedValue(undefined);
  const mkdirMock = vi.fn().mockResolvedValue(undefined);
  const fleetLogCreateMock = vi.fn().mockResolvedValue(undefined);

  const deps: NginxOrchestratorDeps = {
    NginxState: { findOne: findOneMock, findOneAndUpdate: findOneAndUpdateMock },
    FleetLogEvent: { create: fleetLogCreateMock },
    nginxTestImpl: nginxTestMock as unknown as NginxOrchestratorDeps['nginxTestImpl'],
    nginxReloadImpl: nginxReloadMock as unknown as NginxOrchestratorDeps['nginxReloadImpl'],
    writeFile: writeFileMock,
    unlink: unlinkMock,
    mkdir: mkdirMock,
    logEntry: (entry) => {
      logs.push(entry);
    },
    ...partial,
  };

  return {
    deps,
    logs,
    findOneMock,
    findOneAndUpdateMock,
    nginxTestMock,
    nginxReloadMock,
    writeFileMock,
    unlinkMock,
    mkdirMock,
    fleetLogCreateMock,
  };
}

describe('NginxOrchestrator.writeSnippet', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes snippet to managedDir with sanitized slug', async () => {
    const { deps, mkdirMock, writeFileMock } = makeDeps();
    const orch = new NginxOrchestrator(deps);
    const abs = await orch.writeSnippet('my-route', 'server { listen 80; }');
    expect(abs).toBe('/etc/nginx/conf.d/servermon/my-route.conf');
    expect(mkdirMock).toHaveBeenCalledWith('/etc/nginx/conf.d/servermon', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(
      '/etc/nginx/conf.d/servermon/my-route.conf',
      'server { listen 80; }'
    );
  });

  it('rejects slugs with invalid chars', async () => {
    const { deps } = makeDeps();
    const orch = new NginxOrchestrator(deps);
    await expect(orch.writeSnippet('my/route', 'x')).rejects.toThrow(/slug/);
    await expect(orch.writeSnippet('my_route', 'x')).rejects.toThrow(/slug/);
    await expect(orch.writeSnippet('MyRoute', 'x')).rejects.toThrow(/slug/);
    await expect(orch.writeSnippet('', 'x')).rejects.toThrow(/slug/);
    await expect(orch.writeSnippet('../etc/passwd', 'x')).rejects.toThrow(/slug/);
  });

  it('throws when managedDir is unset', async () => {
    const { deps } = makeDeps({ stateDoc: { managedDir: undefined } });
    const orch = new NginxOrchestrator(deps);
    await expect(orch.writeSnippet('ok-slug', 'x')).rejects.toThrow(/managedDir/);
  });

  it('throws when state doc is missing entirely', async () => {
    const { deps } = makeDeps({ stateDoc: null });
    const orch = new NginxOrchestrator(deps);
    await expect(orch.writeSnippet('ok-slug', 'x')).rejects.toThrow(/managedDir/);
  });
});

describe('NginxOrchestrator.removeSnippet', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unlinks the file at managedDir/<slug>.conf', async () => {
    const { deps, unlinkMock } = makeDeps();
    const orch = new NginxOrchestrator(deps);
    await orch.removeSnippet('my-route');
    expect(unlinkMock).toHaveBeenCalledWith('/etc/nginx/conf.d/servermon/my-route.conf');
  });

  it('ignores ENOENT', async () => {
    const { deps } = makeDeps();
    const err = new Error('not found') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    deps.unlink = vi.fn().mockRejectedValue(err);
    const orch = new NginxOrchestrator(deps);
    await expect(orch.removeSnippet('my-route')).resolves.toBeUndefined();
  });

  it('rethrows non-ENOENT errors', async () => {
    const { deps } = makeDeps();
    deps.unlink = vi.fn().mockRejectedValue(new Error('EACCES'));
    const orch = new NginxOrchestrator(deps);
    await expect(orch.removeSnippet('my-route')).rejects.toThrow(/EACCES/);
  });

  it('rejects bad slugs', async () => {
    const { deps } = makeDeps();
    const orch = new NginxOrchestrator(deps);
    await expect(orch.removeSnippet('BAD/slug')).rejects.toThrow(/slug/);
  });
});

describe('NginxOrchestrator.applyAndReload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('happy path: test passes, reload succeeds, updates state and audit log', async () => {
    const { deps, nginxTestMock, nginxReloadMock, findOneAndUpdateMock, logs } = makeDeps();
    const orch = new NginxOrchestrator(deps);
    const res = await orch.applyAndReload();
    expect(res.ok).toBe(true);
    expect(nginxTestMock).toHaveBeenCalled();
    expect(nginxReloadMock).toHaveBeenCalled();
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { key: 'global' },
      expect.objectContaining({
        $set: expect.objectContaining({
          lastReloadSuccess: true,
          lastTestSuccess: true,
        }),
      })
    );
    expect(logs.some((l) => l.eventType === 'nginx.reload')).toBe(true);
  });

  it('when test fails, does NOT reload, updates state lastTestSuccess=false, emits warn', async () => {
    const { deps, nginxTestMock, nginxReloadMock, findOneAndUpdateMock, logs } = makeDeps();
    (nginxTestMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      stderr: 'nginx: [emerg] directive unknown',
    });
    const orch = new NginxOrchestrator(deps);
    const res = await orch.applyAndReload();
    expect(res.ok).toBe(false);
    expect(res.stderr).toContain('directive unknown');
    expect(nginxReloadMock).not.toHaveBeenCalled();
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { key: 'global' },
      expect.objectContaining({
        $set: expect.objectContaining({
          lastTestSuccess: false,
          lastTestOutput: expect.stringContaining('directive unknown'),
        }),
      })
    );
    expect(logs.some((l) => l.level === 'warn' && l.eventType === 'nginx.test.failed')).toBe(true);
  });

  it('when reload fails, updates state lastReloadSuccess=false', async () => {
    const { deps, nginxReloadMock, findOneAndUpdateMock } = makeDeps();
    (nginxReloadMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      stderr: 'nginx: [error] open() /run/nginx.pid failed',
    });
    const orch = new NginxOrchestrator(deps);
    const res = await orch.applyAndReload();
    expect(res.ok).toBe(false);
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { key: 'global' },
      expect.objectContaining({
        $set: expect.objectContaining({ lastReloadSuccess: false }),
      })
    );
  });
});

describe('NginxOrchestrator.listManagedSnippets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns managedServerNames array from state', async () => {
    const { deps } = makeDeps({
      stateDoc: {
        managedDir: '/etc/nginx/conf.d/servermon',
        managedServerNames: ['a.example', 'b.example'],
      },
    });
    const orch = new NginxOrchestrator(deps);
    const names = await orch.listManagedSnippets();
    expect(names).toEqual(['a.example', 'b.example']);
  });

  it('returns empty array when state missing', async () => {
    const { deps } = makeDeps({ stateDoc: null });
    const orch = new NginxOrchestrator(deps);
    const names = await orch.listManagedSnippets();
    expect(names).toEqual([]);
  });

  it('returns empty array when managedServerNames is undefined', async () => {
    const { deps } = makeDeps({
      stateDoc: { managedDir: '/etc/nginx/conf.d/servermon' },
    });
    const orch = new NginxOrchestrator(deps);
    const names = await orch.listManagedSnippets();
    expect(names).toEqual([]);
  });
});
