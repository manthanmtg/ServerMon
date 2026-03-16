/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { servicesModule } from './module';
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

describe('servicesModule', () => {
  it('has the correct id', () => {
    expect(servicesModule.id).toBe('services-monitor');
  });

  it('has the correct name', () => {
    expect(servicesModule.name).toBe('Services Monitor');
  });

  it('has version 1.0.0', () => {
    expect(servicesModule.version).toBe('1.0.0');
  });

  it('registers the ServicesWidget widget', () => {
    expect(servicesModule.widgets).toBeDefined();
    const widget = servicesModule.widgets!.find((w) => w.component === 'ServicesWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('services-overview');
  });

  it('registers the /services route', () => {
    expect(servicesModule.routes).toBeDefined();
    const route = servicesModule.routes!.find((r) => r.path === '/services');
    expect(route).toBeDefined();
    expect(route!.component).toBe('ServicesPage');
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      servicesModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      const ctx = makeCtx();
      servicesModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      servicesModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
    });
  });
});
