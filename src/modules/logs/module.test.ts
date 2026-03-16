/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { logsModule } from './module';
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

describe('logsModule', () => {
  it('has the correct id', () => {
    expect(logsModule.id).toBe('system-logs');
  });

  it('has the correct name', () => {
    expect(logsModule.name).toBe('System Logs');
  });

  it('has version 1.0.0', () => {
    expect(logsModule.version).toBe('1.0.0');
  });

  it('registers the LogsWidget widget', () => {
    expect(logsModule.widgets).toBeDefined();
    const widget = logsModule.widgets!.find((w) => w.component === 'LogsWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('recent-logs');
  });

  it('registers the /logs route', () => {
    expect(logsModule.routes).toBeDefined();
    const route = logsModule.routes!.find((r) => r.path === '/logs');
    expect(route).toBeDefined();
    expect(route!.component).toBe('LogsPage');
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      logsModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      const ctx = makeCtx();
      logsModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      logsModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
    });
  });
});
