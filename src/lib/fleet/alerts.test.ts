/** @vitest-environment node */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  dispatchAlert,
  __resetAlertThrottleForTests__,
  type AlertDispatchDeps,
  type AlertPayload,
  type AlertChannelLike,
  type AlertSubscriptionLike,
} from './alerts';

function makeDeps(overrides: {
  channels: AlertChannelLike[];
  subscriptions: AlertSubscriptionLike[];
  fetchImpl?: typeof fetch;
  nodemailerImpl?: unknown;
  now?: () => Date;
}): AlertDispatchDeps & {
  mocks: { fleetLogCreate: ReturnType<typeof vi.fn>; findByIdAndUpdate: ReturnType<typeof vi.fn> };
} {
  const fleetLogCreate = vi.fn().mockResolvedValue(undefined);
  const findByIdAndUpdate = vi.fn().mockResolvedValue(undefined);
  const channels = overrides.channels;
  const subscriptions = overrides.subscriptions;

  const deps: AlertDispatchDeps = {
    AlertChannel: {
      find: (filter: Record<string, unknown>) => {
        const list = channels.filter((c) => {
          if (filter._id !== undefined) return String(c._id) === String(filter._id);
          return true;
        });
        return {
          lean: () => list,
          then: (cb: (v: unknown[]) => unknown) => Promise.resolve(list).then(cb),
        } as never;
      },
      findById: (id: unknown) => {
        const found = channels.find((c) => String(c._id) === String(id)) ?? null;
        return {
          lean: () => found,
          then: (cb: (v: unknown) => unknown) => Promise.resolve(found).then(cb),
        } as never;
      },
      findByIdAndUpdate,
    },
    AlertSubscription: {
      find: (filter: Record<string, unknown>) => {
        const list = subscriptions.filter((s) => {
          if (filter.enabled !== undefined) return s.enabled === filter.enabled;
          return true;
        });
        return {
          lean: () => list,
          then: (cb: (v: unknown[]) => unknown) => Promise.resolve(list).then(cb),
        } as never;
      },
    },
    FleetLogEvent: { create: fleetLogCreate },
    fetchImpl: overrides.fetchImpl,
    nodemailerImpl: overrides.nodemailerImpl,
    now: overrides.now,
  };

  return Object.assign(deps, { mocks: { fleetLogCreate, findByIdAndUpdate } });
}

function makeChannel(
  partial: Partial<AlertChannelLike> & {
    _id: string;
    kind: AlertChannelLike['kind'];
    config: Record<string, unknown>;
  }
): AlertChannelLike {
  return {
    name: partial.name ?? 'Channel',
    slug: partial.slug ?? partial._id,
    enabled: partial.enabled ?? true,
    minSeverity: partial.minSeverity ?? 'warn',
    ...partial,
  };
}

function makeSub(
  partial: Partial<AlertSubscriptionLike> & { _id: string; channelId: string }
): AlertSubscriptionLike {
  return {
    name: partial.name ?? 'Sub',
    eventKinds: partial.eventKinds ?? ['*'],
    minSeverity: partial.minSeverity ?? 'warn',
    enabled: partial.enabled ?? true,
    filters: partial.filters,
    throttle: partial.throttle,
    ...partial,
  };
}

const basePayload: AlertPayload = {
  title: 'Node rebooted',
  message: 'Node n1 rebooted',
  severity: 'warn',
  eventKind: 'node.reboot',
  nodeId: 'n1',
};

describe('dispatchAlert', () => {
  beforeEach(() => {
    __resetAlertThrottleForTests__();
  });

  it('dispatches a webhook and returns count', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const channel = makeChannel({
      _id: 'c1',
      kind: 'webhook',
      config: { url: 'https://example.com/hook' },
    });
    const sub = makeSub({ _id: 's1', channelId: 'c1' });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await dispatchAlert(basePayload, deps);

    expect(result.dispatched).toBe(1);
    expect(result.failures).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payload.eventKind).toBe('node.reboot');
    expect(body.channel.kind).toBe('webhook');
    expect(deps.mocks.findByIdAndUpdate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ lastSuccess: true })
    );
  });

  it('dispatches a slack message with block attachments', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const channel = makeChannel({
      _id: 'c2',
      kind: 'slack',
      config: { webhookUrl: 'https://hooks.slack.com/xyz', channel: '#ops' },
    });
    const sub = makeSub({ _id: 's2', channelId: 'c2' });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await dispatchAlert(basePayload, deps);

    expect(result.dispatched).toBe(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.channel).toBe('#ops');
    expect(Array.isArray(body.attachments)).toBe(true);
    expect(body.attachments[0].fields.some((f: { title: string }) => f.title === 'Severity')).toBe(
      true
    );
  });

  it('logs pending email when nodemailer missing', async () => {
    const channel = makeChannel({
      _id: 'c3',
      kind: 'email',
      config: { to: ['ops@example.com'] },
    });
    const sub = makeSub({ _id: 's3', channelId: 'c3' });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
    });

    const result = await dispatchAlert(basePayload, deps);
    expect(result.dispatched).toBe(1);
    expect(deps.mocks.fleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'alerts',
        eventType: 'alert.email_pending',
      })
    );
  });

  it('uses nodemailerImpl when provided', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const channel = makeChannel({
      _id: 'c4',
      kind: 'email',
      config: { to: ['ops@example.com'], subject: 'Alert!' },
    });
    const sub = makeSub({ _id: 's4', channelId: 'c4' });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      nodemailerImpl: { sendMail },
    });

    const result = await dispatchAlert(basePayload, deps);
    expect(result.dispatched).toBe(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['ops@example.com'],
        subject: 'Alert!',
      })
    );
    // No pending log should be written when nodemailer handled it.
    expect(deps.mocks.fleetLogCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'alert.email_pending' })
    );
  });

  it('filters subscriptions by severity (info < warn)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const channel = makeChannel({
      _id: 'c5',
      kind: 'webhook',
      config: { url: 'https://example.com/hook' },
    });
    const sub = makeSub({
      _id: 's5',
      channelId: 'c5',
      minSeverity: 'error',
    });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // payload severity is warn, sub.minSeverity is error -> skipped
    const result = await dispatchAlert(basePayload, deps);
    expect(result.dispatched).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('filters by channel.minSeverity', async () => {
    const fetchImpl = vi.fn();
    const channel = makeChannel({
      _id: 'c6',
      kind: 'webhook',
      config: { url: 'https://x' },
      minSeverity: 'error',
    });
    const sub = makeSub({ _id: 's6', channelId: 'c6' });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // payload severity is warn, channel min is error -> skipped
    const result = await dispatchAlert(basePayload, deps);
    expect(result.dispatched).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips disabled channels', async () => {
    const fetchImpl = vi.fn();
    const channel = makeChannel({
      _id: 'c7',
      kind: 'webhook',
      config: { url: 'https://x' },
      enabled: false,
    });
    const sub = makeSub({ _id: 's7', channelId: 'c7' });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await dispatchAlert(basePayload, deps);
    expect(result.dispatched).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('matches wildcard eventKinds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const channel = makeChannel({
      _id: 'c8',
      kind: 'webhook',
      config: { url: 'https://x' },
    });
    const sub = makeSub({ _id: 's8', channelId: 'c8', eventKinds: ['*'] });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await dispatchAlert({ ...basePayload, eventKind: 'route.status_change' }, deps);
    expect(result.dispatched).toBe(1);
  });

  it('skips when eventKind does not match', async () => {
    const fetchImpl = vi.fn();
    const channel = makeChannel({
      _id: 'c9',
      kind: 'webhook',
      config: { url: 'https://x' },
    });
    const sub = makeSub({
      _id: 's9',
      channelId: 'c9',
      eventKinds: ['frp.state_change'],
    });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await dispatchAlert(basePayload, deps);
    expect(result.dispatched).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('applies nodeId filter', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const channel = makeChannel({
      _id: 'c10',
      kind: 'webhook',
      config: { url: 'https://x' },
    });
    const sub = makeSub({
      _id: 's10',
      channelId: 'c10',
      filters: { nodeIds: ['n2'] },
    });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await dispatchAlert(basePayload, deps);
    expect(result.dispatched).toBe(0);

    const result2 = await dispatchAlert({ ...basePayload, nodeId: 'n2' }, deps);
    expect(result2.dispatched).toBe(1);
  });

  it('respects throttle window (simplified in-memory counter)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const channel = makeChannel({
      _id: 'c11',
      kind: 'webhook',
      config: { url: 'https://x' },
    });
    const sub = makeSub({
      _id: 's11',
      channelId: 'c11',
      throttle: { windowSec: 60, maxPerWindow: 2 },
    });

    let now = Date.now();
    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date(now),
    });

    // Three attempts in same window; third should be skipped
    const r1 = await dispatchAlert(basePayload, deps);
    const r2 = await dispatchAlert(basePayload, deps);
    const r3 = await dispatchAlert(basePayload, deps);
    expect(r1.dispatched + r2.dispatched + r3.dispatched).toBe(2);

    // advance beyond window
    now += 61_000;
    const r4 = await dispatchAlert(basePayload, deps);
    expect(r4.dispatched).toBe(1);
  });

  it('records failure when webhook returns non-ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const channel = makeChannel({
      _id: 'c12',
      kind: 'webhook',
      config: { url: 'https://x' },
    });
    const sub = makeSub({ _id: 's12', channelId: 'c12' });

    const deps = makeDeps({
      channels: [channel],
      subscriptions: [sub],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await dispatchAlert(basePayload, deps);
    expect(result.dispatched).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toEqual({
      channelId: 'c12',
      error: 'webhook http 500',
    });
    expect(deps.mocks.findByIdAndUpdate).toHaveBeenCalledWith(
      'c12',
      expect.objectContaining({ lastSuccess: false, lastError: 'webhook http 500' })
    );
  });

  it('records failure when channel missing', async () => {
    const sub = makeSub({ _id: 's13', channelId: 'missing' });
    const deps = makeDeps({ channels: [], subscriptions: [sub] });
    const result = await dispatchAlert(basePayload, deps);
    expect(result.dispatched).toBe(0);
    expect(result.failures).toEqual([{ channelId: 'missing', error: 'channel not found' }]);
  });

  it('calls logEntry hook on success and failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    const channelOk = makeChannel({
      _id: 'ok',
      kind: 'webhook',
      config: { url: 'https://x' },
    });
    const channelBad = makeChannel({
      _id: 'bad',
      kind: 'webhook',
      config: { url: 'https://y' },
    });
    const sub1 = makeSub({ _id: 'sub-ok', channelId: 'ok' });
    const sub2 = makeSub({ _id: 'sub-bad', channelId: 'bad' });

    const logEntry = vi.fn();
    const deps = makeDeps({
      channels: [channelOk, channelBad],
      subscriptions: [sub1, sub2],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    deps.logEntry = logEntry;

    const result = await dispatchAlert(basePayload, deps);
    expect(result.dispatched).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(logEntry.mock.calls.some((c) => c[0].eventType === 'alert.dispatched')).toBe(true);
    expect(logEntry.mock.calls.some((c) => c[0].eventType === 'alert.dispatch_failed')).toBe(true);
  });
});
