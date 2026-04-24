import { describe, it, expect, vi } from 'vitest';
import type { Model } from 'mongoose';
import { enforceResourceGuard } from './resourceGuardMiddleware';

function mockPolicyModel(docs: Array<Record<string, unknown>>): Model<unknown> {
  const find = vi.fn().mockReturnValue({
    lean: () => Promise.resolve(docs),
  });
  return { find } as unknown as Model<unknown>;
}

function mockLogModel(): {
  model: Model<unknown>;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockResolvedValue({});
  const model = { create } as unknown as Model<unknown>;
  return { model, create };
}

describe('enforceResourceGuard', () => {
  it('allows when no limit is configured', async () => {
    const ResourcePolicy = mockPolicyModel([]);
    const { model: FleetLogEvent, create } = mockLogModel();

    const result = await enforceResourceGuard({
      key: 'maxAgents',
      scope: 'global',
      currentCounter: async () => 42,
      ResourcePolicy,
      FleetLogEvent,
    });

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(42);
    expect(result.limit).toBeUndefined();
    expect(result.enforcement).toBe('hard');
    expect(result.soft).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('allows when current <= hard limit', async () => {
    const ResourcePolicy = mockPolicyModel([
      {
        scope: 'global',
        limits: { maxAgents: 10 },
        enforcement: { maxAgents: 'hard' },
      },
    ]);
    const { model: FleetLogEvent, create } = mockLogModel();

    const result = await enforceResourceGuard({
      key: 'maxAgents',
      scope: 'global',
      currentCounter: async () => 5,
      ResourcePolicy,
      FleetLogEvent,
    });

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(5);
    expect(result.limit).toBe(10);
    expect(result.enforcement).toBe('hard');
    expect(create).not.toHaveBeenCalled();
  });

  it('denies when current > hard limit', async () => {
    const ResourcePolicy = mockPolicyModel([
      {
        scope: 'global',
        limits: { maxAgents: 10 },
        enforcement: { maxAgents: 'hard' },
      },
    ]);
    const { model: FleetLogEvent, create } = mockLogModel();

    const result = await enforceResourceGuard({
      key: 'maxAgents',
      scope: 'global',
      currentCounter: async () => 11,
      ResourcePolicy,
      FleetLogEvent,
    });

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(11);
    expect(result.limit).toBe(10);
    expect(result.enforcement).toBe('hard');
    expect(result.soft).toBe(false);
    expect(result.message).toContain('maxAgents');
    expect(create).not.toHaveBeenCalled();
  });

  it('allows but emits FleetLogEvent warn when soft limit exceeded', async () => {
    const ResourcePolicy = mockPolicyModel([
      {
        scope: 'global',
        limits: { maxPublicRoutes: 5 },
        enforcement: { maxPublicRoutes: 'soft' },
      },
    ]);
    const { model: FleetLogEvent, create } = mockLogModel();

    const result = await enforceResourceGuard({
      key: 'maxPublicRoutes',
      scope: 'global',
      currentCounter: async () => 6,
      ResourcePolicy,
      FleetLogEvent,
      actorUserId: 'alice',
    });

    expect(result.allowed).toBe(true);
    expect(result.soft).toBe(true);
    expect(result.enforcement).toBe('soft');
    expect(result.limit).toBe(5);
    expect(result.current).toBe(6);

    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.level).toBe('warn');
    expect(arg.eventType).toBe('limit.soft_exceeded');
    expect(arg.actorUserId).toBe('alice');
    expect(arg.metadata).toMatchObject({
      key: 'maxPublicRoutes',
      scope: 'global',
      limit: 5,
      current: 6,
    });
  });

  it('does not throw when FleetLogEvent is omitted and soft limit exceeds', async () => {
    const ResourcePolicy = mockPolicyModel([
      {
        scope: 'global',
        limits: { maxPublicRoutes: 2 },
        enforcement: { maxPublicRoutes: 'soft' },
      },
    ]);
    const result = await enforceResourceGuard({
      key: 'maxPublicRoutes',
      scope: 'global',
      currentCounter: async () => 10,
      ResourcePolicy,
    });
    expect(result.allowed).toBe(true);
    expect(result.soft).toBe(true);
  });

  it('swallows errors from FleetLogEvent.create', async () => {
    const ResourcePolicy = mockPolicyModel([
      {
        scope: 'global',
        limits: { maxPublicRoutes: 2 },
        enforcement: { maxPublicRoutes: 'soft' },
      },
    ]);
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const FleetLogEvent = { create } as unknown as Model<unknown>;

    const result = await enforceResourceGuard({
      key: 'maxPublicRoutes',
      scope: 'global',
      currentCounter: async () => 3,
      ResourcePolicy,
      FleetLogEvent,
    });
    expect(result.allowed).toBe(true);
  });

  it('applies node-specific overrides on top of global policy', async () => {
    const ResourcePolicy = mockPolicyModel([
      {
        scope: 'global',
        limits: { maxProxiesPerNode: 5 },
        enforcement: { maxProxiesPerNode: 'hard' },
      },
      {
        scope: 'node',
        scopeId: 'node-1',
        limits: { maxProxiesPerNode: 2 },
        enforcement: { maxProxiesPerNode: 'hard' },
      },
    ]);

    const result = await enforceResourceGuard({
      key: 'maxProxiesPerNode',
      scope: 'node',
      scopeId: 'node-1',
      currentCounter: async () => 3,
      ResourcePolicy,
    });

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(2);
    expect(result.current).toBe(3);
  });

  it('defaults enforcement to hard when not specified', async () => {
    const ResourcePolicy = mockPolicyModel([
      {
        scope: 'global',
        limits: { maxAgents: 3 },
        enforcement: {},
      },
    ]);
    const { model: FleetLogEvent, create } = mockLogModel();

    const result = await enforceResourceGuard({
      key: 'maxAgents',
      scope: 'global',
      currentCounter: async () => 4,
      ResourcePolicy,
      FleetLogEvent,
    });

    expect(result.allowed).toBe(false);
    expect(result.enforcement).toBe('hard');
    expect(create).not.toHaveBeenCalled();
  });
});
