import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFleetStream, type FleetStreamEvent } from './useFleetStream';

type Listener = (ev: { data: string }) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  public readyState = 0;
  public closed = false;
  private listeners = new Map<string, Set<Listener>>();

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: Listener) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, cb: Listener) {
    this.listeners.get(type)?.delete(cb);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  /** Test helper: fire an event of a given type. */
  dispatch(type: string, data: unknown) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const cb of set) cb({ data: JSON.stringify(data) });
  }

  /** Test helper: fire a plain event with no data payload. */
  fireBare(type: string) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const cb of set) (cb as (ev: unknown) => void)({ type });
  }
}

describe('useFleetStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an EventSource instance on mount', () => {
    renderHook(() => useFleetStream({}));
    expect(FakeEventSource.instances.length).toBe(1);
    expect(FakeEventSource.instances[0].url).toBe('/api/fleet/stream');
  });

  it('appends nodeId/routeId/kind query params', () => {
    renderHook(() => useFleetStream({ nodeId: 'n1', routeId: 'r1', kind: 'node.heartbeat' }));
    const url = FakeEventSource.instances[0].url;
    expect(url).toContain('nodeId=n1');
    expect(url).toContain('routeId=r1');
    expect(url).toContain('kind=node.heartbeat');
  });

  it('does not create an EventSource when enabled=false', () => {
    renderHook(() => useFleetStream({ enabled: false }));
    expect(FakeEventSource.instances.length).toBe(0);
  });

  it('sets connected=true on open event', () => {
    const { result } = renderHook(() => useFleetStream({}));
    expect(result.current.connected).toBe(false);
    act(() => {
      FakeEventSource.instances[0].fireBare('open');
    });
    expect(result.current.connected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('sets error and disconnects on error event', () => {
    const { result } = renderHook(() => useFleetStream({}));
    act(() => {
      FakeEventSource.instances[0].fireBare('open');
    });
    expect(result.current.connected).toBe(true);
    act(() => {
      FakeEventSource.instances[0].fireBare('error');
    });
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBe('stream error');
  });

  it('invokes onEvent when the server sends a typed fleet event', () => {
    const received: FleetStreamEvent[] = [];
    const { result } = renderHook(() =>
      useFleetStream({
        onEvent: (ev) => {
          received.push(ev);
        },
      })
    );
    const ev: FleetStreamEvent = {
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: { tunnelStatus: 'connected' },
    };
    act(() => {
      FakeEventSource.instances[0].dispatch('node.heartbeat', ev);
    });
    expect(received.length).toBe(1);
    expect(received[0]).toEqual(ev);
    expect(result.current.lastEvent).toEqual({ kind: ev.kind, at: ev.at });
  });

  it('invokes onEvent on a generic message', () => {
    const received: FleetStreamEvent[] = [];
    renderHook(() =>
      useFleetStream({
        onEvent: (ev) => {
          received.push(ev);
        },
      })
    );
    const ev: FleetStreamEvent = {
      kind: 'route.status_change',
      routeId: 'r1',
      at: new Date().toISOString(),
      data: { from: 'pending', to: 'active' },
    };
    act(() => {
      FakeEventSource.instances[0].dispatch('message', ev);
    });
    expect(received.length).toBe(1);
    expect(received[0]).toEqual(ev);
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() => useFleetStream({ nodeId: 'n1' }));
    const es = FakeEventSource.instances[0];
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });

  it('sets an error when window.EventSource is missing', () => {
    vi.stubGlobal('EventSource', undefined);
    const { result } = renderHook(() => useFleetStream({}));
    expect(result.current.error).toContain('EventSource');
    expect(result.current.connected).toBe(false);
  });

  it('swallows malformed JSON frames without calling onEvent', () => {
    const onEvent = vi.fn();
    renderHook(() => useFleetStream({ onEvent }));
    // Manually dispatch a raw listener with bad data
    const es = FakeEventSource.instances[0];
    const listeners = (
      es as unknown as {
        listeners: Map<string, Set<Listener>>;
      }
    ).listeners.get('node.heartbeat');
    expect(listeners).toBeDefined();
    act(() => {
      for (const l of listeners!) l({ data: '{bad json' });
    });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
