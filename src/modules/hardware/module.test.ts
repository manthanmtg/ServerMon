/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { hardwareModule } from './module';
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

describe('hardwareModule', () => {
  it('has the correct id', () => {
    expect(hardwareModule.id).toBe('hardware-info');
  });

  it('has the correct name', () => {
    expect(hardwareModule.name).toBe('Hardware Info');
  });

  it('has version 1.0.0', () => {
    expect(hardwareModule.version).toBe('1.0.0');
  });

  it('registers the HardwareWidget widget', () => {
    expect(hardwareModule.widgets).toBeDefined();
    const widget = hardwareModule.widgets!.find((w) => w.component === 'HardwareWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('hardware-overview');
  });

  it('registers the /hardware route', () => {
    expect(hardwareModule.routes).toBeDefined();
    const route = hardwareModule.routes!.find((r) => r.path === '/hardware');
    expect(route).toBeDefined();
    expect(route!.component).toBe('HardwarePage');
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      hardwareModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      const ctx = makeCtx();
      hardwareModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      hardwareModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
    });
  });
});
