import { createLogger } from '@/lib/logger';

const log = createLogger('fleet:alerts');

export type AlertSeverity = 'info' | 'warn' | 'error';

export interface AlertPayload {
  title: string;
  message: string;
  severity: AlertSeverity;
  eventKind: string;
  nodeId?: string;
  routeId?: string;
  metadata?: Record<string, unknown>;
  at?: string;
}

export interface AlertChannelLike {
  _id: unknown;
  name: string;
  slug?: string;
  kind: 'webhook' | 'slack' | 'email';
  config: Record<string, unknown>;
  enabled: boolean;
  minSeverity: AlertSeverity;
}

export interface AlertSubscriptionLike {
  _id: unknown;
  name: string;
  channelId: string;
  eventKinds: string[];
  minSeverity: AlertSeverity;
  enabled: boolean;
  filters?: {
    nodeIds?: string[];
    tags?: string[];
    eventTypes?: string[];
  };
  throttle?: {
    windowSec: number;
    maxPerWindow: number;
  };
}

export interface AlertDispatchDeps {
  AlertChannel: {
    find: (filter: Record<string, unknown>) => {
      lean?: () => Promise<unknown[]> | unknown[];
    } & PromiseLike<unknown[]>;
    findById?: (id: unknown) => { lean?: () => Promise<unknown> } & PromiseLike<unknown>;
    findByIdAndUpdate?: (id: unknown, update: Record<string, unknown>) => PromiseLike<unknown>;
  };
  AlertSubscription: {
    find: (filter: Record<string, unknown>) => {
      lean?: () => Promise<unknown[]> | unknown[];
    } & PromiseLike<unknown[]>;
  };
  FleetLogEvent: {
    create: (doc: Record<string, unknown>) => PromiseLike<unknown>;
  };
  fetchImpl?: typeof fetch;
  nodemailerImpl?: unknown;
  logEntry?: (e: {
    level: string;
    service: string;
    eventType: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) => void;
  now?: () => Date;
}

export interface AlertDispatchResult {
  dispatched: number;
  failures: Array<{ channelId: string; error: string }>;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  info: 0,
  warn: 1,
  error: 2,
};

interface ThrottleState {
  windowStart: number;
  count: number;
}

// Module-scoped throttle counter (simple in-memory, keyed by subscription id).
const throttleCounters = new Map<string, ThrottleState>();

export function __resetAlertThrottleForTests__(): void {
  throttleCounters.clear();
}

function severityGte(a: AlertSeverity, b: AlertSeverity): boolean {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b];
}

async function unwrapQuery<T>(q: unknown): Promise<T> {
  if (!q || typeof q !== 'object') return q as T;
  const obj = q as { lean?: () => unknown; then?: unknown };
  if (typeof obj.lean === 'function') {
    return Promise.resolve(obj.lean() as T);
  }
  if (typeof obj.then === 'function') {
    return Promise.resolve(q as PromiseLike<T>);
  }
  return q as T;
}

function matchFilters(payload: AlertPayload, filters: AlertSubscriptionLike['filters']): boolean {
  if (!filters) return true;
  if (filters.nodeIds && filters.nodeIds.length > 0) {
    if (!payload.nodeId || !filters.nodeIds.includes(payload.nodeId)) return false;
  }
  if (filters.tags && filters.tags.length > 0) {
    const tags = (payload.metadata?.tags as string[] | undefined) ?? [];
    if (!filters.tags.some((t) => tags.includes(t))) return false;
  }
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    const eventType = (payload.metadata?.eventType as string | undefined) ?? payload.eventKind;
    const matches = filters.eventTypes.some((re) => {
      try {
        return new RegExp(re).test(eventType);
      } catch {
        return false;
      }
    });
    if (!matches) return false;
  }
  return true;
}

function checkThrottle(sub: AlertSubscriptionLike, nowMs: number): boolean {
  if (!sub.throttle) return true;
  const id = String(sub._id);
  const state = throttleCounters.get(id);
  const windowMs = sub.throttle.windowSec * 1000;
  if (!state || nowMs - state.windowStart >= windowMs) {
    throttleCounters.set(id, { windowStart: nowMs, count: 1 });
    return true;
  }
  if (state.count >= sub.throttle.maxPerWindow) {
    return false;
  }
  state.count += 1;
  return true;
}

function normalizeWebhookConfig(cfg: Record<string, unknown>): {
  url: string;
  method: 'POST' | 'PUT';
  headers: Record<string, string>;
} {
  const url = typeof cfg.url === 'string' ? cfg.url : '';
  const methodRaw = typeof cfg.method === 'string' ? cfg.method.toUpperCase() : 'POST';
  const method: 'POST' | 'PUT' = methodRaw === 'PUT' ? 'PUT' : 'POST';
  const headers =
    cfg.headers && typeof cfg.headers === 'object' ? (cfg.headers as Record<string, string>) : {};
  return { url, method, headers };
}

function buildSlackBody(
  payload: AlertPayload,
  cfg: Record<string, unknown>
): Record<string, unknown> {
  const channel = typeof cfg.channel === 'string' ? cfg.channel : undefined;
  const color =
    payload.severity === 'error' ? '#D93025' : payload.severity === 'warn' ? '#F9AB00' : '#1A73E8';
  return {
    ...(channel ? { channel } : {}),
    text: payload.title,
    attachments: [
      {
        color,
        title: payload.title,
        text: payload.message,
        fields: [
          { title: 'Severity', value: payload.severity, short: true },
          { title: 'Event', value: payload.eventKind, short: true },
          ...(payload.nodeId ? [{ title: 'Node', value: payload.nodeId, short: true }] : []),
          ...(payload.routeId ? [{ title: 'Route', value: payload.routeId, short: true }] : []),
        ],
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchWebhook(
  payload: AlertPayload,
  subscription: AlertSubscriptionLike,
  channel: AlertChannelLike,
  fetchImpl: typeof fetch
): Promise<void> {
  const { url, method, headers } = normalizeWebhookConfig(channel.config);
  if (!url) throw new Error('webhook url missing');
  const body = JSON.stringify({
    payload,
    subscription: { id: String(subscription._id), name: subscription.name },
    channel: { name: channel.name, kind: channel.kind },
  });
  const res = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body,
    },
    5000
  );
  if (!res.ok) {
    throw new Error(`webhook http ${res.status}`);
  }
}

async function dispatchSlack(
  payload: AlertPayload,
  channel: AlertChannelLike,
  fetchImpl: typeof fetch
): Promise<void> {
  const url = typeof channel.config.webhookUrl === 'string' ? channel.config.webhookUrl : '';
  if (!url) throw new Error('slack webhookUrl missing');
  const body = JSON.stringify(buildSlackBody(payload, channel.config));
  const res = await fetchWithTimeout(
    fetchImpl,
    url,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body },
    5000
  );
  if (!res.ok) {
    throw new Error(`slack http ${res.status}`);
  }
}

interface NodemailerLike {
  sendMail: (opts: {
    to: string[];
    subject: string;
    text: string;
    html?: string;
  }) => Promise<unknown>;
}

async function dispatchEmail(
  payload: AlertPayload,
  channel: AlertChannelLike,
  deps: AlertDispatchDeps
): Promise<void> {
  const to = Array.isArray(channel.config.to) ? (channel.config.to as string[]) : [];
  const subject =
    typeof channel.config.subject === 'string' ? channel.config.subject : payload.title;
  if (deps.nodemailerImpl && typeof deps.nodemailerImpl === 'object') {
    const impl = deps.nodemailerImpl as NodemailerLike;
    if (typeof impl.sendMail === 'function') {
      await impl.sendMail({
        to,
        subject,
        text: payload.message,
      });
      return;
    }
  }
  // Fallback: log a pending event via FleetLogEvent.
  await deps.FleetLogEvent.create({
    service: 'alerts',
    level: 'info',
    eventType: 'alert.email_pending',
    message: 'email alert pending SMTP',
    metadata: {
      to,
      subject,
      severity: payload.severity,
      eventKind: payload.eventKind,
      nodeId: payload.nodeId,
    },
  });
}

async function updateChannelStatus(
  deps: AlertDispatchDeps,
  channelId: unknown,
  success: boolean,
  error: string | undefined,
  now: Date
): Promise<void> {
  if (!deps.AlertChannel.findByIdAndUpdate) return;
  try {
    await deps.AlertChannel.findByIdAndUpdate(channelId, {
      lastTriggeredAt: now,
      lastSuccess: success,
      lastError: error,
    });
  } catch (err) {
    log.warn('failed to update channel status', err);
  }
}

export async function dispatchAlert(
  payload: AlertPayload,
  deps: AlertDispatchDeps
): Promise<AlertDispatchResult> {
  const now = (deps.now ?? (() => new Date()))();
  const at = payload.at ?? now.toISOString();
  const enrichedPayload: AlertPayload = { ...payload, at };
  const fetchImpl = deps.fetchImpl ?? fetch;

  const subsQuery = deps.AlertSubscription.find({ enabled: true });
  const subs = (await unwrapQuery<AlertSubscriptionLike[]>(subsQuery)) ?? [];

  const matching = subs.filter((s) => {
    if (!s.enabled) return false;
    const hasKind = s.eventKinds.includes('*') || s.eventKinds.includes(enrichedPayload.eventKind);
    if (!hasKind) return false;
    if (!severityGte(enrichedPayload.severity, s.minSeverity)) return false;
    if (!matchFilters(enrichedPayload, s.filters)) return false;
    return true;
  });

  let dispatched = 0;
  const failures: Array<{ channelId: string; error: string }> = [];

  for (const sub of matching) {
    if (!checkThrottle(sub, now.getTime())) {
      continue;
    }
    let channel: AlertChannelLike | null = null;
    try {
      if (deps.AlertChannel.findById) {
        const q = deps.AlertChannel.findById(sub.channelId);
        channel = (await unwrapQuery<AlertChannelLike | null>(q)) ?? null;
      } else {
        const listQ = deps.AlertChannel.find({ _id: sub.channelId });
        const list = (await unwrapQuery<AlertChannelLike[]>(listQ)) ?? [];
        channel = list[0] ?? null;
      }
    } catch (err) {
      failures.push({
        channelId: String(sub.channelId),
        error: `load channel failed: ${(err as Error).message}`,
      });
      continue;
    }

    if (!channel) {
      failures.push({ channelId: String(sub.channelId), error: 'channel not found' });
      continue;
    }
    if (!channel.enabled) continue;
    if (!severityGte(enrichedPayload.severity, channel.minSeverity)) continue;

    try {
      if (channel.kind === 'webhook') {
        await dispatchWebhook(enrichedPayload, sub, channel, fetchImpl);
      } else if (channel.kind === 'slack') {
        await dispatchSlack(enrichedPayload, channel, fetchImpl);
      } else if (channel.kind === 'email') {
        await dispatchEmail(enrichedPayload, channel, deps);
      }
      dispatched += 1;
      await updateChannelStatus(deps, channel._id, true, undefined, now);
      deps.logEntry?.({
        service: 'alerts',
        level: 'info',
        eventType: 'alert.dispatched',
        message: `Alert dispatched to ${channel.name}`,
        metadata: { channelId: String(channel._id), kind: channel.kind },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ channelId: String(channel._id), error: msg });
      await updateChannelStatus(deps, channel._id, false, msg, now);
      deps.logEntry?.({
        service: 'alerts',
        level: 'warn',
        eventType: 'alert.dispatch_failed',
        message: `Alert dispatch failed for ${channel.name}: ${msg}`,
        metadata: { channelId: String(channel._id), kind: channel.kind, error: msg },
      });
    }
  }

  return { dispatched, failures };
}
