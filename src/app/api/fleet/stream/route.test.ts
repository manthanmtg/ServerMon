/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));

import { GET } from './route';
import { fleetEventBus, __resetEventBusForTests__ } from '@/lib/fleet/eventBus';

function makeReq(url = 'http://localhost/api/fleet/stream'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

async function readChunk(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  try {
    const { value } = await reader.read();
    return new TextDecoder().decode(value);
  } finally {
    reader.releaseLock();
  }
}

describe('GET /api/fleet/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetEventBusForTests__();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 200 with SSE headers when authenticated', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(res.headers.get('Connection')).toBe('keep-alive');
    // ensure a stream body is returned
    expect(res.body).not.toBeNull();
    await res.body!.cancel();
  });

  it('sends an initial ping event on connect', async () => {
    const res = await GET(makeReq());
    const text = await readChunk(res.body as ReadableStream<Uint8Array>);
    expect(text).toContain('event: ping');
    expect(text).toContain('"ok":true');
    await res.body!.cancel();
  });

  it('forwards fleet events emitted on the bus after connect', async () => {
    const res = await GET(makeReq());
    const reader = res.body!.getReader();

    // consume the initial ping
    await reader.read();

    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: { tunnelStatus: 'connected' },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: node.heartbeat');
    expect(text).toContain('"nodeId":"n1"');
    expect(text).toContain('"tunnelStatus":"connected"');

    reader.releaseLock();
    await res.body!.cancel();
  });

  it('filters events by nodeId query param', async () => {
    const res = await GET(makeReq('http://localhost/api/fleet/stream?nodeId=n1'));
    const reader = res.body!.getReader();
    await reader.read(); // consume ping

    // event for a different node should NOT arrive
    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n2',
      at: new Date().toISOString(),
      data: {},
    });

    // event for the subscribed node SHOULD arrive
    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: { pick: true },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"nodeId":"n1"');
    expect(text).not.toContain('"nodeId":"n2"');

    reader.releaseLock();
    await res.body!.cancel();
  });

  it('filters events by kind query param', async () => {
    const res = await GET(makeReq('http://localhost/api/fleet/stream?kind=node.reboot'));
    const reader = res.body!.getReader();
    await reader.read(); // consume ping

    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: {},
    });
    fleetEventBus.emit({
      kind: 'node.reboot',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: { newBootId: 'boot-2' },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: node.reboot');
    expect(text).not.toContain('event: node.heartbeat');

    reader.releaseLock();
    await res.body!.cancel();
  });

  it('unsubscribes from the bus when the stream is cancelled', async () => {
    const res = await GET(makeReq());
    // After start, there should be exactly one bus listener
    // (from this request).
    expect(fleetEventBus.__listenerCount__()).toBe(1);

    await res.body!.cancel();

    expect(fleetEventBus.__listenerCount__()).toBe(0);
  });

  it('ignores unknown `kind` query values and falls back to unfiltered', async () => {
    const res = await GET(makeReq('http://localhost/api/fleet/stream?kind=not.a.real.kind'));
    const reader = res.body!.getReader();
    await reader.read(); // consume ping

    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: {},
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: node.heartbeat');

    reader.releaseLock();
    await res.body!.cancel();
  });
});
