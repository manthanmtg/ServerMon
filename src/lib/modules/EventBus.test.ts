/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { eventBus } from './EventBus';

describe('EventBus', () => {
  afterEach(() => {
    eventBus.removeAllListeners();
  });

  it('emitSystemEvent triggers a registered listener with the provided data', () => {
    const handler = vi.fn();
    eventBus.on('test:event', handler);
    eventBus.emitSystemEvent('test:event', { value: 42 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('emitSystemEvent with no data passes undefined to listener', () => {
    const handler = vi.fn();
    eventBus.on('test:nodata', handler);
    eventBus.emitSystemEvent('test:nodata');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('multiple listeners all receive the same event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    eventBus.on('multi', h1);
    eventBus.on('multi', h2);
    eventBus.emitSystemEvent('multi', 'payload');
    expect(h1).toHaveBeenCalledWith('payload');
    expect(h2).toHaveBeenCalledWith('payload');
  });

  it('removed listener does not receive subsequent events', () => {
    const handler = vi.fn();
    eventBus.on('removable', handler);
    eventBus.off('removable', handler);
    eventBus.emitSystemEvent('removable', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('listener only receives events for the event name it subscribed to', () => {
    const handler = vi.fn();
    eventBus.on('specific:event', handler);
    eventBus.emitSystemEvent('other:event', 'irrelevant');
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports up to 100 max listeners without warnings', () => {
    expect(eventBus.getMaxListeners()).toBe(100);
  });

  it('is a singleton — the exported instance is the same object each import', async () => {
    const { eventBus: a } = await import('./EventBus');
    const { eventBus: b } = await import('./EventBus');
    expect(a).toBe(b);
  });
});
