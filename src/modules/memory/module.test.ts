/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { memoryModule } from './module';
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

describe('memoryModule', () => {
  it('has the correct id', () => {
    expect(memoryModule.id).toBe('memory-monitor');
  });

  it('has the correct name', () => {
    expect(memoryModule.name).toBe('Memory Monitor');
  });

  it('has version 1.0.0', () => {
    expect(memoryModule.version).toBe('1.0.0');
  });

  it('registers the MemoryWidget widget', () => {
    expect(memoryModule.widgets).toBeDefined();
    const widget = memoryModule.widgets!.find((w) => w.component === 'MemoryWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('memory-detailed');
  });

  it('registers the /memory route', () => {
    expect(memoryModule.routes).toBeDefined();
    const route = memoryModule.routes!.find((r) => r.path === '/memory');
    expect(route).toBeDefined();
    expect(route!.component).toBe('MemoryPage');
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      memoryModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      const ctx = makeCtx();
      memoryModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      memoryModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
    });
  });
});
