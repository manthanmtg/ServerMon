/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { healthModule } from './module';
import type { ModuleContext } from '@/types/module';

function makeCtx(): ModuleContext {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    events: { emit: vi.fn(), on: vi.fn() },
    analytics: { track: vi.fn() },
    db: { getCollection: vi.fn() },
    system: { capabilities: { platform: 'linux', arch: 'x64', cpus: 4, memory: 8 } },
    settings: { get: vi.fn(), set: vi.fn() },
    ui: { theme: { id: 'default', mode: 'dark' } },
  };
}

describe('healthModule definition', () => {
  it('has the correct id and name', () => {
    expect(healthModule.id).toBe('health-monitor');
    expect(healthModule.name).toBe('Health Monitor');
  });

  it('has version 1.0.0', () => {
    expect(healthModule.version).toBe('1.0.0');
  });

  it('registers the HealthWidget widget', () => {
    expect(healthModule.widgets).toBeDefined();
    const widget = healthModule.widgets!.find((w) => w.component === 'HealthWidget');
    expect(widget).toBeDefined();
  });

  it('has no routes (dashboard-only widget)', () => {
    expect(healthModule.routes).toBeUndefined();
  });

  describe('lifecycle hooks', () => {
    let ctx: ModuleContext;

    beforeEach(() => {
      ctx = makeCtx();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('init() logs initialization', () => {
      healthModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      healthModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    });

    it('start() emits system:health events on interval', () => {
      healthModule.start!(ctx);
      vi.advanceTimersByTime(10000);
      expect(ctx.events.emit).toHaveBeenCalledWith(
        'system:health',
        expect.objectContaining({ status: 'healthy' })
      );
    });

    it('start() emitted event includes cpu and timestamp', () => {
      healthModule.start!(ctx);
      vi.advanceTimersByTime(10000);
      const [, payload] = (ctx.events.emit as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(typeof payload.cpu).toBe('number');
      expect(typeof payload.timestamp).toBe('number');
    });

    it('stop() logs stop message', () => {
      healthModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
    });
  });
});
