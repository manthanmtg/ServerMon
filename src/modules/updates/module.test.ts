/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { updatesModule } from './module';
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

describe('updatesModule definition', () => {
  it('has id "updates-monitor"', () => {
    expect(updatesModule.id).toBe('updates-monitor');
  });

  it('has the correct name', () => {
    expect(updatesModule.name).toBe('Updates Monitor');
  });

  it('has version 1.0.0', () => {
    expect(updatesModule.version).toBe('1.0.0');
  });

  it('has no dashboard widget (page only)', () => {
    expect(updatesModule.widgets).toBeUndefined();
  });

  it('registers /updates route', () => {
    expect(updatesModule.routes).toBeDefined();
    const route = updatesModule.routes!.find((r) => r.path === '/updates');
    expect(route).toBeDefined();
    expect(route!.component).toBe('UpdatePage');
    expect(route!.name).toBe('Updates');
  });

  describe('lifecycle hooks', () => {
    it('init() calls logger.info', () => {
      const ctx = makeCtx();
      updatesModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('start() calls logger.info', () => {
      const ctx = makeCtx();
      updatesModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('stop() calls logger.info', () => {
      const ctx = makeCtx();
      updatesModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });
  });
});
