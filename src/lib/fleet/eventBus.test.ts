/** @vitest-environment node */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fleetEventBus, __resetEventBusForTests__, type FleetEvent } from './eventBus';

describe('fleetEventBus', () => {
  beforeEach(() => {
    __resetEventBusForTests__();
  });

  it('fans out emitted events to all subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    fleetEventBus.subscribe(a);
    fleetEventBus.subscribe(b);

    const ev: FleetEvent = {
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: { foo: 'bar' },
    };
    fleetEventBus.emit(ev);

    expect(a).toHaveBeenCalledWith(expect.objectContaining({ kind: 'node.heartbeat' }));
    expect(b).toHaveBeenCalledWith(expect.objectContaining({ kind: 'node.heartbeat' }));
  });

  it('unsubscribe stops further events from arriving', () => {
    const listener = vi.fn();
    const unsubscribe = fleetEventBus.subscribe(listener);

    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: {},
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: {},
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('adds an `at` ISO timestamp if the caller omits it', () => {
    const listener = vi.fn();
    fleetEventBus.subscribe(listener);

    // Note: the public type marks `at` required, but we still want the runtime
    // behavior to populate it when missing.
    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      data: {},
    } as unknown as FleetEvent);

    const received = listener.mock.calls[0][0] as FleetEvent;
    expect(received.at).toBeDefined();
    expect(() => new Date(received.at).toISOString()).not.toThrow();
  });

  it('filters events by kind', () => {
    const listener = vi.fn();
    fleetEventBus.subscribeFiltered({ kind: 'node.reboot' }, listener);

    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: {},
    });
    expect(listener).not.toHaveBeenCalled();

    fleetEventBus.emit({
      kind: 'node.reboot',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: {},
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('filters events by nodeId', () => {
    const listener = vi.fn();
    fleetEventBus.subscribeFiltered({ nodeId: 'n1' }, listener);

    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n2',
      at: new Date().toISOString(),
      data: {},
    });
    expect(listener).not.toHaveBeenCalled();

    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: {},
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('filters events by routeId', () => {
    const listener = vi.fn();
    fleetEventBus.subscribeFiltered({ routeId: 'r1' }, listener);

    fleetEventBus.emit({
      kind: 'route.status_change',
      routeId: 'r2',
      at: new Date().toISOString(),
      data: {},
    });
    expect(listener).not.toHaveBeenCalled();

    fleetEventBus.emit({
      kind: 'route.status_change',
      routeId: 'r1',
      at: new Date().toISOString(),
      data: {},
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('returns unsubscribe from subscribeFiltered that removes the wrapper', () => {
    const listener = vi.fn();
    const unsubscribe = fleetEventBus.subscribeFiltered({ kind: 'node.reboot' }, listener);
    unsubscribe();
    fleetEventBus.emit({
      kind: 'node.reboot',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: {},
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('supports at least 1000 concurrent listeners without exceeding the limit', () => {
    // Attach 1000 listeners; Node should not emit a MaxListenersExceededWarning.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const unsubs: Array<() => void> = [];
    for (let i = 0; i < 1000; i++) {
      unsubs.push(fleetEventBus.subscribe(() => {}));
    }

    // maxListeners should be at least 1000
    expect(fleetEventBus.__maxListeners__()).toBeGreaterThanOrEqual(1000);
    expect(fleetEventBus.__listenerCount__()).toBe(1000);

    unsubs.forEach((u) => u());
    expect(fleetEventBus.__listenerCount__()).toBe(0);
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('__resetEventBusForTests__ removes listeners across the suite', () => {
    const listener = vi.fn();
    fleetEventBus.subscribe(listener);
    expect(fleetEventBus.__listenerCount__()).toBe(1);
    __resetEventBusForTests__();
    expect(fleetEventBus.__listenerCount__()).toBe(0);
    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: 'n1',
      at: new Date().toISOString(),
      data: {},
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
