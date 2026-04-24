/** @vitest-environment node */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { startAlertDispatch } from '@/lib/fleet/alertSubscriber';
import {
  __resetAlertThrottleForTests__,
  type AlertChannelLike,
  type AlertSubscriptionLike,
} from '@/lib/fleet/alerts';
import type { FleetEvent } from '@/lib/fleet/eventBus';

// In-process event bus with the same shape as fleetEventBus.
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

function queryableLean<T>(value: T) {
  return {
    lean: () => value,
    then: (resolve: (v: T) => unknown) => Promise.resolve(value).then(resolve),
  } as never;
}

describe('alert event flow: eventBus -> alertSubscriber -> dispatchAlert', () => {
  beforeEach(() => __resetAlertThrottleForTests__());

  it('intercepts a node.reboot event and sends a webhook with the expected shape', async () => {
    const bus = new FakeBus();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const channels: AlertChannelLike[] = [
      {
        _id: 'ch-1',
        name: 'Ops Hook',
        kind: 'webhook',
        config: { url: 'https://ops.example.com/hook' },
        enabled: true,
        minSeverity: 'info',
      },
    ];
    const subs: AlertSubscriptionLike[] = [
      {
        _id: 'sub-1',
        name: 'All Events',
        channelId: 'ch-1',
        eventKinds: ['*'],
        minSeverity: 'info',
        enabled: true,
      },
    ];

    const unsub = startAlertDispatch({
      fleetEventBus: bus,
      AlertChannel: {
        find: () => queryableLean(channels),
        findById: (id: unknown) => queryableLean(channels.find((c) => c._id === id) ?? null),
        findByIdAndUpdate: vi.fn().mockResolvedValue(undefined),
      },
      AlertSubscription: { find: () => queryableLean(subs) },
      FleetLogEvent: { create: vi.fn().mockResolvedValue(undefined) },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    bus.emit({
      kind: 'node.reboot',
      nodeId: 'node-42',
      at: '2026-04-20T10:00:00Z',
      data: { bootAt: '2026-04-20T10:00:00Z' },
    });

    // Subscriber dispatches via Promise.resolve().then(...), so one tick is enough.
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://ops.example.com/hook');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payload.eventKind).toBe('node.reboot');
    expect(body.payload.severity).toBe('warn');
    expect(body.payload.nodeId).toBe('node-42');
    expect(body.payload.title).toContain('node-42');
    expect(body.payload.at).toBe('2026-04-20T10:00:00Z');
    expect(body.channel.name).toBe('Ops Hook');
    expect(body.subscription.id).toBe('sub-1');

    unsub();

    // After unsubscribe, further events do not trigger additional fetches.
    bus.emit({
      kind: 'node.reboot',
      nodeId: 'node-99',
      at: '2026-04-20T10:05:00Z',
      data: {},
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('skips dispatch when the subscription severity floor is higher than the event', async () => {
    const bus = new FakeBus();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const channels: AlertChannelLike[] = [
      {
        _id: 'ch-1',
        name: 'High',
        kind: 'webhook',
        config: { url: 'https://x' },
        enabled: true,
        minSeverity: 'info',
      },
    ];
    const subs: AlertSubscriptionLike[] = [
      {
        _id: 'sub-only-errors',
        name: 'errors only',
        channelId: 'ch-1',
        eventKinds: ['*'],
        minSeverity: 'error',
        enabled: true,
      },
    ];

    const unsub = startAlertDispatch({
      fleetEventBus: bus,
      AlertChannel: {
        find: () => queryableLean(channels),
        findById: (id: unknown) => queryableLean(channels.find((c) => c._id === id) ?? null),
      },
      AlertSubscription: { find: () => queryableLean(subs) },
      FleetLogEvent: { create: vi.fn().mockResolvedValue(undefined) },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // node.heartbeat maps to severity 'info' -> below 'error' floor -> skipped.
    bus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: '2026-04-20T10:00:00Z',
      data: {},
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchImpl).not.toHaveBeenCalled();

    // node.status_change with status=offline maps to 'error' -> allowed.
    bus.emit({
      kind: 'node.status_change',
      nodeId: 'n1',
      at: '2026-04-20T10:01:00Z',
      data: { status: 'offline' },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    unsub();
  });

  it('calls onError when channel lookup fails', async () => {
    const bus = new FakeBus();
    const onError = vi.fn();

    const unsub = startAlertDispatch({
      fleetEventBus: bus,
      AlertChannel: {
        find: () =>
          ({
            lean: () => {
              throw new Error('channel boom');
            },
            then: (_r: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
              rej(new Error('channel boom')),
          }) as never,
      },
      AlertSubscription: {
        find: () =>
          ({
            lean: () => {
              throw new Error('subs boom');
            },
            then: (_r: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
              rej(new Error('subs boom')),
          }) as never,
      },
      FleetLogEvent: { create: vi.fn().mockResolvedValue(undefined) },
      onError,
    });

    bus.emit({
      kind: 'node.reboot',
      nodeId: 'n1',
      at: '2026-04-20T10:00:00Z',
      data: {},
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(onError).toHaveBeenCalled();
    unsub();
  });
});
