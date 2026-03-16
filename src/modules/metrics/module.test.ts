/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { metricsModule } from './module';
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

describe('metricsModule', () => {
  it('has the correct id', () => {
    expect(metricsModule.id).toBe('system-metrics');
  });

  it('has the correct name', () => {
    expect(metricsModule.name).toBe('Real-time Metrics');
  });

  it('has version 1.0.0', () => {
    expect(metricsModule.version).toBe('1.0.0');
  });

  it('registers the CPUChartWidget widget', () => {
    expect(metricsModule.widgets).toBeDefined();
    const widget = metricsModule.widgets!.find((w) => w.component === 'CPUChartWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('cpu-history');
  });

  it('registers the MemoryChartWidget widget', () => {
    expect(metricsModule.widgets).toBeDefined();
    const widget = metricsModule.widgets!.find((w) => w.component === 'MemoryChartWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('mem-history');
  });

  it('has no routes (dashboard-only widgets)', () => {
    expect(metricsModule.routes).toBeUndefined();
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      metricsModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      const ctx = makeCtx();
      metricsModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Metrics Stream Active'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      metricsModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Suspended'));
    });
  });
});
