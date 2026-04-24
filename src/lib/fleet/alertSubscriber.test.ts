/** @vitest-environment node */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { startAlertDispatch, __mapEventToPayloadForTests__ } from './alertSubscriber';
import { __resetAlertThrottleForTests__ } from './alerts';
import type { FleetEvent } from './eventBus';

class FakeBus {
  private ee = new EventEmitter();
  subscribe(listener: (ev: FleetEvent) => void): () => void {
    const wrap = (ev: FleetEvent) => listener(ev);
    this.ee.on('ev', wrap);
    return () => this.ee.off('ev', wrap);
  }
  emit(ev: FleetEvent): void {
    this.ee.emit('ev', ev);
  }
}

describe('mapEventToPayload', () => {
  it('maps node.reboot to warn severity', () => {
    const p = __mapEventToPayloadForTests__({
      kind: 'node.reboot',
      nodeId: 'n1',
      at: '2024-01-01T00:00:00Z',
      data: { bootAt: '2024-01-01T00:00:00Z' },
    });
    expect(p?.severity).toBe('warn');
    expect(p?.title).toBe('Node n1 rebooted');
    expect(p?.nodeId).toBe('n1');
    expect(p?.eventKind).toBe('node.reboot');
  });

  it('maps node.status_change offline to error', () => {
    const p = __mapEventToPayloadForTests__({
      kind: 'node.status_change',
      nodeId: 'n1',
      at: '2024-01-01T00:00:00Z',
      data: { status: 'offline' },
    });
    expect(p?.severity).toBe('error');
  });

  it('maps node.status_change degraded to warn', () => {
    const p = __mapEventToPayloadForTests__({
      kind: 'node.status_change',
      nodeId: 'n1',
      at: '2024-01-01T00:00:00Z',
      data: { status: 'degraded' },
    });
    expect(p?.severity).toBe('warn');
  });

  it('maps route.status_change cert_failed to error', () => {
    const p = __mapEventToPayloadForTests__({
      kind: 'route.status_change',
      routeId: 'r1',
      at: '2024-01-01T00:00:00Z',
      data: { status: 'cert_failed' },
    });
    expect(p?.severity).toBe('error');
    expect(p?.routeId).toBe('r1');
  });

  it('maps revision.applied to info', () => {
    const p = __mapEventToPayloadForTests__({
      kind: 'revision.applied',
      at: '2024-01-01T00:00:00Z',
      data: { version: 12 },
    });
    expect(p?.severity).toBe('info');
    expect(p?.title).toContain('revision');
  });

  it('maps frp.state_change failed to error', () => {
    const p = __mapEventToPayloadForTests__({
      kind: 'frp.state_change',
      at: '2024-01-01T00:00:00Z',
      data: { runtimeState: 'failed' },
    });
    expect(p?.severity).toBe('error');
  });

  it('maps node.heartbeat to info', () => {
    const p = __mapEventToPayloadForTests__({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: '2024-01-01T00:00:00Z',
      data: {},
    });
    expect(p?.severity).toBe('info');
  });
});

describe('startAlertDispatch', () => {
  beforeEach(() => {
    __resetAlertThrottleForTests__();
  });

  it('subscribes to event bus and dispatches mapped payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const bus = new FakeBus();

    const channels = [
      {
        _id: 'c1',
        name: 'Webhook',
        kind: 'webhook' as const,
        config: { url: 'https://x' },
        enabled: true,
        minSeverity: 'warn' as const,
      },
    ];
    const subs = [
      {
        _id: 's1',
        name: 'All',
        channelId: 'c1',
        eventKinds: ['*'],
        minSeverity: 'info' as const,
        enabled: true,
      },
    ];

    const unsub = startAlertDispatch({
      fleetEventBus: bus,
      AlertChannel: {
        find: () =>
          ({
            lean: () => channels,
            then: (cb: (v: unknown[]) => unknown) => Promise.resolve(channels).then(cb),
          }) as never,
        findById: (id: unknown) => {
          const found = channels.find((c) => c._id === id) ?? null;
          return {
            lean: () => found,
            then: (cb: (v: unknown) => unknown) => Promise.resolve(found).then(cb),
          } as never;
        },
        findByIdAndUpdate: vi.fn().mockResolvedValue(undefined),
      },
      AlertSubscription: {
        find: () =>
          ({
            lean: () => subs,
            then: (cb: (v: unknown[]) => unknown) => Promise.resolve(subs).then(cb),
          }) as never,
      },
      FleetLogEvent: { create: vi.fn().mockResolvedValue(undefined) },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    bus.emit({
      kind: 'node.reboot',
      nodeId: 'n42',
      at: '2024-01-01T00:00:00Z',
      data: {},
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.payload.eventKind).toBe('node.reboot');
    expect(body.payload.nodeId).toBe('n42');

    unsub();

    // After unsubscribe, further emissions should not trigger fetch
    bus.emit({
      kind: 'node.reboot',
      nodeId: 'n43',
      at: '2024-01-01T00:00:01Z',
      data: {},
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('calls onError when dispatch rejects', async () => {
    const bus = new FakeBus();
    const onError = vi.fn();

    const unsub = startAlertDispatch({
      fleetEventBus: bus,
      AlertChannel: {
        find: () =>
          ({
            lean: () => {
              throw new Error('boom');
            },
            then: (_cb: (v: unknown[]) => unknown, err: (e: unknown) => unknown) =>
              err(new Error('boom')),
          }) as never,
      },
      AlertSubscription: {
        find: () =>
          ({
            lean: () => {
              throw new Error('subs-boom');
            },
            then: (_cb: (v: unknown[]) => unknown, err: (e: unknown) => unknown) =>
              err(new Error('subs-boom')),
          }) as never,
      },
      FleetLogEvent: { create: vi.fn().mockResolvedValue(undefined) },
      onError,
    });

    bus.emit({
      kind: 'node.reboot',
      nodeId: 'n1',
      at: '2024-01-01T00:00:00Z',
      data: {},
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(onError).toHaveBeenCalled();
    unsub();
  });
});
