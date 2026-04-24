import { describe, it, expect, vi } from 'vitest';
import type { Model } from 'mongoose';
import { checkLimit, getEffectivePolicy, type EffectivePolicy } from './resourceGuards';

describe('checkLimit', () => {
  it('passes when no limit is set', () => {
    const p: EffectivePolicy = { limits: {}, enforcement: {} };
    const r = checkLimit({ key: 'maxAgents', current: 9999, policy: p });
    expect(r.passed).toBe(true);
    expect(r.soft).toBe(false);
    expect(r.limit).toBeUndefined();
    expect(r.current).toBe(9999);
  });

  it('passes when current <= limit', () => {
    const p: EffectivePolicy = {
      limits: { maxAgents: 10 },
      enforcement: { maxAgents: 'hard' },
    };
    const r = checkLimit({ key: 'maxAgents', current: 10, policy: p });
    expect(r.passed).toBe(true);
    expect(r.soft).toBe(false);
    expect(r.limit).toBe(10);
  });

  it('fails when current > limit (hard enforcement)', () => {
    const p: EffectivePolicy = {
      limits: { maxAgents: 10 },
      enforcement: { maxAgents: 'hard' },
    };
    const r = checkLimit({ key: 'maxAgents', current: 11, policy: p });
    expect(r.passed).toBe(false);
    expect(r.soft).toBe(false);
    expect(r.message).toContain('maxAgents');
    expect(r.message).toContain('11');
    expect(r.message).toContain('10');
  });

  it('returns soft=true when enforcement is soft', () => {
    const p: EffectivePolicy = {
      limits: { maxPublicRoutes: 5 },
      enforcement: { maxPublicRoutes: 'soft' },
    };
    const r = checkLimit({
      key: 'maxPublicRoutes',
      current: 6,
      policy: p,
    });
    expect(r.passed).toBe(false);
    expect(r.soft).toBe(true);
  });

  it('defaults to hard enforcement when not specified', () => {
    const p: EffectivePolicy = {
      limits: { maxProxiesPerNode: 3 },
      enforcement: {},
    };
    const r = checkLimit({
      key: 'maxProxiesPerNode',
      current: 4,
      policy: p,
    });
    expect(r.passed).toBe(false);
    expect(r.soft).toBe(false);
  });
});

describe('getEffectivePolicy', () => {
  function mockModel(docs: Array<Record<string, unknown>>) {
    const find = vi.fn().mockReturnValue({
      lean: () => Promise.resolve(docs),
    });
    return { find } as unknown as Model<unknown>;
  }

  it('returns global-only policy when scope=global', async () => {
    const model = mockModel([
      {
        scope: 'global',
        limits: { maxAgents: 10, maxPublicRoutes: 5 },
        enforcement: { maxAgents: 'hard', maxPublicRoutes: 'soft' },
      },
    ]);
    const p = await getEffectivePolicy({
      scope: 'global',
      model,
    });
    expect(p.limits.maxAgents).toBe(10);
    expect(p.limits.maxPublicRoutes).toBe(5);
    expect(p.enforcement.maxAgents).toBe('hard');
    expect(p.enforcement.maxPublicRoutes).toBe('soft');
  });

  it('merges node-specific override onto global base', async () => {
    const model = mockModel([
      {
        scope: 'global',
        limits: { maxAgents: 10, maxPublicRoutes: 5 },
        enforcement: { maxAgents: 'hard', maxPublicRoutes: 'hard' },
      },
      {
        scope: 'node',
        scopeId: 'node-1',
        limits: { maxAgents: 20 },
        enforcement: { maxAgents: 'soft' },
      },
    ]);
    const p = await getEffectivePolicy({
      scope: 'node',
      scopeId: 'node-1',
      model,
    });
    expect(p.limits.maxAgents).toBe(20); // override wins
    expect(p.limits.maxPublicRoutes).toBe(5); // from global
    expect(p.enforcement.maxAgents).toBe('soft'); // override wins
    expect(p.enforcement.maxPublicRoutes).toBe('hard'); // from global
  });

  it('returns empty policy when no docs match', async () => {
    const model = mockModel([]);
    const p = await getEffectivePolicy({
      scope: 'global',
      model,
    });
    expect(p.limits).toEqual({});
    expect(p.enforcement).toEqual({});
  });

  it('keeps global when scope-specific doc is missing', async () => {
    const model = mockModel([
      {
        scope: 'global',
        limits: { maxAgents: 50 },
        enforcement: { maxAgents: 'hard' },
      },
    ]);
    const p = await getEffectivePolicy({
      scope: 'node',
      scopeId: 'missing-node',
      model,
    });
    expect(p.limits.maxAgents).toBe(50);
    expect(p.enforcement.maxAgents).toBe('hard');
  });

  it('ignores unrelated scope-specific docs (different scopeId)', async () => {
    const model = mockModel([
      {
        scope: 'global',
        limits: { maxAgents: 50 },
        enforcement: { maxAgents: 'hard' },
      },
      {
        scope: 'node',
        scopeId: 'other-node',
        limits: { maxAgents: 1 },
        enforcement: { maxAgents: 'soft' },
      },
    ]);
    const p = await getEffectivePolicy({
      scope: 'node',
      scopeId: 'target-node',
      model,
    });
    expect(p.limits.maxAgents).toBe(50);
    expect(p.enforcement.maxAgents).toBe('hard');
  });
});
