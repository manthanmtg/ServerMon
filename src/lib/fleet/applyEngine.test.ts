import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyRevision, type ApplyEngineDeps } from './applyEngine';

interface FakeRevision {
  _id: string;
  kind: 'frps' | 'frpc' | 'nginx';
  targetId?: string;
  version: number;
  hash: string;
  rendered: string;
  structured: Record<string, unknown>;
  appliedAt?: Date;
  save: ReturnType<typeof vi.fn>;
}

function makeRevision(overrides: Partial<FakeRevision>): FakeRevision {
  return {
    _id: 'rev1',
    kind: 'frps',
    version: 1,
    hash: 'hashXYZ',
    rendered: 'bindPort = 7000\n',
    structured: {},
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeDeps(partial: Partial<ApplyEngineDeps> & { revision?: FakeRevision | null } = {}): {
  deps: ApplyEngineDeps;
  frpApplyRevision: ReturnType<typeof vi.fn>;
  frpReconcileOnce: ReturnType<typeof vi.fn>;
  nginxWriteSnippet: ReturnType<typeof vi.fn>;
  nginxRemoveSnippet: ReturnType<typeof vi.fn>;
  nginxApplyAndReload: ReturnType<typeof vi.fn>;
  configFindById: ReturnType<typeof vi.fn>;
  frpFindOneAndUpdate: ReturnType<typeof vi.fn>;
  routeFindByIdAndUpdate: ReturnType<typeof vi.fn>;
  nodeFindByIdAndUpdate: ReturnType<typeof vi.fn>;
  revision: FakeRevision | null;
} {
  const revision = 'revision' in partial ? partial.revision! : makeRevision({});
  const frpApplyRevision = vi.fn().mockResolvedValue(undefined);
  const frpReconcileOnce = vi.fn().mockResolvedValue({ action: 'none' });
  const nginxWriteSnippet = vi.fn().mockResolvedValue('/etc/nginx/conf.d/servermon/slug.conf');
  const nginxRemoveSnippet = vi.fn().mockResolvedValue(undefined);
  const nginxApplyAndReload = vi.fn().mockResolvedValue({ ok: true, stderr: '' });
  const configFindById = vi.fn().mockResolvedValue(revision);
  const frpFindOneAndUpdate = vi.fn().mockResolvedValue(null);
  const routeFindByIdAndUpdate = vi.fn().mockResolvedValue(null);
  const nodeFindByIdAndUpdate = vi.fn().mockResolvedValue(null);

  const deps: ApplyEngineDeps = {
    frp: { applyRevision: frpApplyRevision, reconcileOnce: frpReconcileOnce },
    nginx: {
      writeSnippet: nginxWriteSnippet,
      removeSnippet: nginxRemoveSnippet,
      applyAndReload: nginxApplyAndReload,
    },
    ConfigRevision: { findById: configFindById },
    FrpServerState: { findOneAndUpdate: frpFindOneAndUpdate },
    PublicRoute: { findByIdAndUpdate: routeFindByIdAndUpdate },
    Node: { findByIdAndUpdate: nodeFindByIdAndUpdate },
    ...partial,
  };

  return {
    deps,
    frpApplyRevision,
    frpReconcileOnce,
    nginxWriteSnippet,
    nginxRemoveSnippet,
    nginxApplyAndReload,
    configFindById,
    frpFindOneAndUpdate,
    routeFindByIdAndUpdate,
    nodeFindByIdAndUpdate,
    revision,
  };
}

describe('applyRevision', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when revision not found', async () => {
    const { deps } = makeDeps({ revision: null });
    await expect(applyRevision('nope', deps)).rejects.toThrow(/revision not found/);
  });

  it('dispatches frps kind: calls frp.applyRevision and updates FrpServerState', async () => {
    const rev = makeRevision({
      kind: 'frps',
      rendered: 'frps-toml',
      hash: 'frps-hash',
      version: 7,
    });
    const { deps, frpApplyRevision, frpFindOneAndUpdate, nginxApplyAndReload } = makeDeps({
      revision: rev,
    });
    const res = await applyRevision('rev1', deps);
    expect(res.kind).toBe('frps');
    expect(res.reloaded).toBe(false); // frps never triggers nginx reload
    expect(frpApplyRevision).toHaveBeenCalledWith('frps-toml', 'frps-hash');
    expect(nginxApplyAndReload).not.toHaveBeenCalled();
    expect(frpFindOneAndUpdate).toHaveBeenCalledWith(
      { key: 'global' },
      expect.objectContaining({
        $set: expect.objectContaining({
          generatedConfigHash: 'frps-hash',
          configVersion: 7,
          lastAppliedAt: expect.any(Date),
        }),
      })
    );
    expect(rev.save).toHaveBeenCalled();
    expect(rev.appliedAt).toBeInstanceOf(Date);
  });

  it('dispatches frpc kind: updates Node with structured contents', async () => {
    const rev = makeRevision({
      kind: 'frpc',
      targetId: 'node1',
      rendered: 'frpc-toml',
      hash: 'frpc-hash',
      structured: {
        frpcConfig: { protocol: 'tcp' },
        proxyRules: [{ name: 'x', type: 'http' }],
      },
    });
    const { deps, nodeFindByIdAndUpdate, frpApplyRevision } = makeDeps({ revision: rev });
    const res = await applyRevision('rev1', deps);
    expect(res.kind).toBe('frpc');
    expect(res.reloaded).toBe(false);
    expect(frpApplyRevision).not.toHaveBeenCalled();
    expect(nodeFindByIdAndUpdate).toHaveBeenCalledWith(
      'node1',
      expect.objectContaining({
        $set: expect.objectContaining({
          frpcConfig: { protocol: 'tcp' },
          proxyRules: [{ name: 'x', type: 'http' }],
        }),
      })
    );
    expect(rev.appliedAt).toBeInstanceOf(Date);
    expect(rev.save).toHaveBeenCalled();
  });

  it('dispatches nginx kind: writeSnippet + applyAndReload + updates PublicRoute', async () => {
    const rev = makeRevision({
      kind: 'nginx',
      targetId: 'route1',
      rendered: 'server { listen 80; }',
      hash: 'nginx-hash',
      structured: { slug: 'my-route' },
    });
    const { deps, nginxWriteSnippet, nginxApplyAndReload, routeFindByIdAndUpdate } = makeDeps({
      revision: rev,
    });
    const res = await applyRevision('rev1', deps);
    expect(res.kind).toBe('nginx');
    expect(res.reloaded).toBe(true);
    expect(nginxWriteSnippet).toHaveBeenCalledWith('my-route', 'server { listen 80; }');
    expect(nginxApplyAndReload).toHaveBeenCalled();
    expect(routeFindByIdAndUpdate).toHaveBeenCalledWith(
      'route1',
      expect.objectContaining({
        $set: expect.objectContaining({
          nginxConfigRevisionId: 'rev1',
          status: 'active',
          healthStatus: 'healthy',
        }),
      })
    );
    expect(rev.appliedAt).toBeInstanceOf(Date);
  });

  it('nginx kind: reload failure returns reloaded=false and does NOT mark appliedAt', async () => {
    const rev = makeRevision({
      kind: 'nginx',
      targetId: 'route1',
      rendered: 'server { listen 80; }',
      hash: 'nginx-hash',
      structured: { slug: 'my-route' },
    });
    const { deps, nginxApplyAndReload, routeFindByIdAndUpdate } = makeDeps({ revision: rev });
    (nginxApplyAndReload as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      stderr: 'nginx: [emerg] server name conflict',
    });

    const res = await applyRevision('rev1', deps);
    expect(res.kind).toBe('nginx');
    expect(res.reloaded).toBe(false);
    expect(res.detail).toContain('server name conflict');
    expect(rev.appliedAt).toBeUndefined();
    expect(rev.save).not.toHaveBeenCalled();
    expect(routeFindByIdAndUpdate).toHaveBeenCalledWith(
      'route1',
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'nginx_reload_failed',
        }),
      })
    );
  });

  it('nginx kind: throws if structured.slug missing', async () => {
    const rev = makeRevision({
      kind: 'nginx',
      targetId: 'route1',
      rendered: 'x',
      hash: 'h',
      structured: {},
    });
    const { deps } = makeDeps({ revision: rev });
    await expect(applyRevision('rev1', deps)).rejects.toThrow(/slug/);
  });

  it('frpc kind: throws if targetId missing', async () => {
    const rev = makeRevision({
      kind: 'frpc',
      targetId: undefined,
      rendered: 'x',
      hash: 'h',
      structured: {},
    });
    const { deps } = makeDeps({ revision: rev });
    await expect(applyRevision('rev1', deps)).rejects.toThrow(/targetId/);
  });

  it('nginx kind: throws if targetId missing', async () => {
    const rev = makeRevision({
      kind: 'nginx',
      targetId: undefined,
      rendered: 'x',
      hash: 'h',
      structured: { slug: 'ok' },
    });
    const { deps } = makeDeps({ revision: rev });
    await expect(applyRevision('rev1', deps)).rejects.toThrow(/targetId/);
  });

  it('frps kind: failure in frp.applyRevision keeps appliedAt unset', async () => {
    const rev = makeRevision({ kind: 'frps' });
    const { deps, frpApplyRevision } = makeDeps({ revision: rev });
    (frpApplyRevision as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('apply failed')
    );
    await expect(applyRevision('rev1', deps)).rejects.toThrow(/apply failed/);
    expect(rev.appliedAt).toBeUndefined();
    expect(rev.save).not.toHaveBeenCalled();
  });
});
