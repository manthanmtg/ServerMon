/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { networkModule } from './module';
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

describe('networkModule definition', () => {
  it('has id "network-monitor"', () => {
    expect(networkModule.id).toBe('network-monitor');
  });

  it('has the correct name', () => {
    expect(networkModule.name).toBe('Network Monitor');
  });

  it('has version 1.0.0', () => {
    expect(networkModule.version).toBe('1.0.0');
  });

  it('has no dashboard widget', () => {
    expect(networkModule.widgets).toBeUndefined();
  });

  it('registers /network route', () => {
    expect(networkModule.routes).toBeDefined();
    const route = networkModule.routes!.find((r) => r.path === '/network');
    expect(route).toBeDefined();
    expect(route!.component).toBe('NetworkPage');
  });

  describe('lifecycle hooks', () => {
    it('init() calls logger.info', () => {
      const ctx = makeCtx();
      networkModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('start() calls logger.info', () => {
      const ctx = makeCtx();
      networkModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('stop() calls logger.info', () => {
      const ctx = makeCtx();
      networkModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });
  });
});
