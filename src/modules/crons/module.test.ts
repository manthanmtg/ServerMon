/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { cronsModule } from './module';
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

describe('cronsModule definition', () => {
  it('has id "crons-manager"', () => {
    expect(cronsModule.id).toBe('crons-manager');
  });

  it('has the correct name', () => {
    expect(cronsModule.name).toBe('Cron Jobs Manager');
  });

  it('has version 1.0.0', () => {
    expect(cronsModule.version).toBe('1.0.0');
  });

  it('registers CronsWidget', () => {
    expect(cronsModule.widgets).toBeDefined();
    const widget = cronsModule.widgets!.find((w) => w.component === 'CronsWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('crons-overview');
  });

  it('registers /crons route', () => {
    expect(cronsModule.routes).toBeDefined();
    const route = cronsModule.routes!.find((r) => r.path === '/crons');
    expect(route).toBeDefined();
    expect(route!.component).toBe('CronsPage');
  });

  describe('lifecycle hooks', () => {
    it('init() calls logger.info', () => {
      const ctx = makeCtx();
      cronsModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('start() calls logger.info', () => {
      const ctx = makeCtx();
      cronsModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('stop() calls logger.info', () => {
      const ctx = makeCtx();
      cronsModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });
  });
});
