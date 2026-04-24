/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import type { Model } from 'mongoose';
import { renderFrpcToml, renderFrpsToml, hashToml } from '@/lib/fleet/toml';
import { saveRevision } from '@/lib/fleet/revisions';
import { applyRevision, type ApplyEngineDeps } from '@/lib/fleet/applyEngine';
import { NodeZodSchema } from '@/models/Node';

interface StoredRevision {
  _id: string;
  kind: 'frps' | 'frpc' | 'nginx';
  targetId?: string;
  version: number;
  hash: string;
  rendered: string;
  structured: unknown;
  appliedAt?: Date;
  save: ReturnType<typeof vi.fn>;
}

// An in-memory ConfigRevision model that supports the subset of the mongoose
// API `saveRevision` and `applyRevision` need.
function makeInMemoryRevisionModel(): {
  model: Model<unknown>;
  getAll: () => StoredRevision[];
  getById: (id: string) => StoredRevision | undefined;
} {
  const store: StoredRevision[] = [];
  let nextId = 1;

  const model = {
    findOne: (filter: Record<string, unknown>) => {
      const matches = store.filter((r) => {
        for (const [k, v] of Object.entries(filter)) {
          const rv = (r as unknown as Record<string, unknown>)[k];
          // Treat null and undefined as equivalent (mongoose-like behavior).
          if (v === null || v === undefined) {
            if (rv !== null && rv !== undefined) return false;
          } else if (rv !== v) {
            return false;
          }
        }
        return true;
      });
      return {
        sort: (s: Record<string, 1 | -1>) => ({
          lean: async () => {
            const field = Object.keys(s)[0] as keyof StoredRevision;
            const dir = s[field as string];
            matches.sort((a, b) => {
              const av = a[field] as number;
              const bv = b[field] as number;
              return dir === -1 ? bv - av : av - bv;
            });
            return matches[0] ?? null;
          },
        }),
      };
    },
    create: async (doc: Record<string, unknown>) => {
      const id = `rev-${nextId++}`;
      const stored: StoredRevision = {
        _id: id,
        kind: doc.kind as StoredRevision['kind'],
        targetId: doc.targetId as string | undefined,
        version: doc.version as number,
        hash: doc.hash as string,
        rendered: doc.rendered as string,
        structured: doc.structured,
        save: vi.fn().mockResolvedValue(undefined),
      };
      store.push(stored);
      return stored;
    },
    findById: async (id: string) => store.find((r) => r._id === id) ?? null,
  } as unknown as Model<unknown>;

  return {
    model,
    getAll: () => store.slice(),
    getById: (id: string) => store.find((r) => r._id === id),
  };
}

describe('rollback flow: save two revisions, rollback applies the earlier one', () => {
  it('frpc rollback restores the earlier structured node config', async () => {
    const revisions = makeInMemoryRevisionModel();

    const node = NodeZodSchema.parse({
      name: 'Apollo',
      slug: 'apollo',
      proxyRules: [
        {
          name: 'web',
          type: 'http',
          localIp: '127.0.0.1',
          localPort: 3000,
          subdomain: 'apollo',
        },
      ],
    });

    // Revision 1: original config.
    const renderedV1 = renderFrpcToml({
      serverAddr: 'hub.example.com',
      serverPort: 7000,
      authToken: 'tok',
      node,
    });
    const v1 = await saveRevision(revisions.model, {
      kind: 'frpc',
      targetId: 'node-apollo',
      structured: { slug: node.slug, frpcConfig: node.frpcConfig, proxyRules: node.proxyRules },
      rendered: renderedV1,
    });
    expect(v1.version).toBe(1);

    // Revision 2: add a second proxy rule.
    const modifiedNode = {
      ...node,
      proxyRules: [
        ...node.proxyRules,
        {
          name: 'db',
          type: 'tcp' as const,
          localIp: '127.0.0.1',
          localPort: 5432,
          remotePort: 15432,
          customDomains: [],
          enabled: true,
          status: 'disabled' as const,
        },
      ],
    };
    const renderedV2 = renderFrpcToml({
      serverAddr: 'hub.example.com',
      serverPort: 7000,
      authToken: 'tok',
      node: modifiedNode,
    });
    const v2 = await saveRevision(revisions.model, {
      kind: 'frpc',
      targetId: 'node-apollo',
      structured: {
        slug: modifiedNode.slug,
        frpcConfig: modifiedNode.frpcConfig,
        proxyRules: modifiedNode.proxyRules,
      },
      rendered: renderedV2,
    });
    expect(v2.version).toBe(2);
    expect(v2.hash).not.toBe(v1.hash);
    expect(v2.diffFromPrevious).toBeDefined();
    expect(v2.diffFromPrevious).toMatch(/\+\[\[proxies\]\]|name =/);

    // Rollback: apply v1 again — the applyEngine dispatches to mocked orchestrators.
    const nodeFindByIdAndUpdate = vi.fn().mockResolvedValue(null);
    const deps: ApplyEngineDeps = {
      ConfigRevision: { findById: revisions.model.findById },
      FrpServerState: { findOneAndUpdate: vi.fn() },
      PublicRoute: { findByIdAndUpdate: vi.fn() },
      Node: { findByIdAndUpdate: nodeFindByIdAndUpdate },
    };

    const rollback = await applyRevision(v1.id, deps);
    expect(rollback.kind).toBe('frpc');
    expect(nodeFindByIdAndUpdate).toHaveBeenCalledWith(
      'node-apollo',
      expect.objectContaining({
        $set: expect.objectContaining({
          // The restored proxyRules should be the V1 shape (1 rule).
          proxyRules: node.proxyRules,
        }),
      })
    );

    const stored = revisions.getById(v1.id);
    expect(stored?.appliedAt).toBeInstanceOf(Date);
    expect(stored?.save).toHaveBeenCalled();
  });

  it('frps rollback dispatches to the frp orchestrator (mocked) and updates FrpServerState', async () => {
    const revisions = makeInMemoryRevisionModel();

    const frpsV1 = renderFrpsToml({
      bindPort: 7000,
      vhostHttpPort: 8080,
      authToken: 'tok',
      subdomainHost: 'example.com',
    });
    const v1 = await saveRevision(revisions.model, {
      kind: 'frps',
      targetId: null,
      structured: { bindPort: 7000, vhostHttpPort: 8080, subdomainHost: 'example.com' },
      rendered: frpsV1,
    });

    // Bumped vhost port in V2.
    const frpsV2 = renderFrpsToml({
      bindPort: 7000,
      vhostHttpPort: 9090,
      authToken: 'tok',
      subdomainHost: 'example.com',
    });
    const v2 = await saveRevision(revisions.model, {
      kind: 'frps',
      targetId: null,
      structured: { bindPort: 7000, vhostHttpPort: 9090, subdomainHost: 'example.com' },
      rendered: frpsV2,
    });
    expect(v2.version).toBe(2);

    // Now roll back to v1.
    const frpApplyRevision = vi.fn().mockResolvedValue(undefined);
    const frpFindOneAndUpdate = vi.fn().mockResolvedValue(null);
    const deps: ApplyEngineDeps = {
      frp: {
        applyRevision: frpApplyRevision,
        reconcileOnce: vi.fn().mockResolvedValue({ action: 'none' }),
      },
      ConfigRevision: { findById: revisions.model.findById },
      FrpServerState: { findOneAndUpdate: frpFindOneAndUpdate },
      PublicRoute: { findByIdAndUpdate: vi.fn() },
      Node: { findByIdAndUpdate: vi.fn() },
    };

    const result = await applyRevision(v1.id, deps);
    expect(result.kind).toBe('frps');
    expect(frpApplyRevision).toHaveBeenCalledWith(frpsV1, v1.hash);
    expect(frpFindOneAndUpdate).toHaveBeenCalledWith(
      { key: 'global' },
      expect.objectContaining({
        $set: expect.objectContaining({
          generatedConfigHash: v1.hash,
          configVersion: 1,
        }),
      })
    );
  });

  it('saving identical content twice returns the same version (idempotent)', async () => {
    const revisions = makeInMemoryRevisionModel();
    const rendered = renderFrpsToml({
      bindPort: 7000,
      vhostHttpPort: 8080,
      authToken: 'tok',
      subdomainHost: 'example.com',
    });

    const first = await saveRevision(revisions.model, {
      kind: 'frps',
      targetId: null,
      structured: { bindPort: 7000 },
      rendered,
    });
    const second = await saveRevision(revisions.model, {
      kind: 'frps',
      targetId: null,
      structured: { bindPort: 7000 },
      rendered,
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(1); // same hash -> no new revision
    expect(second.hash).toBe(hashToml(rendered));
    expect(revisions.getAll()).toHaveLength(1);
  });
});
