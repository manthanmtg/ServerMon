/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { endpointsModule } from './module';
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

describe('endpointsModule definition', () => {
  it('has id "endpoints-manager"', () => {
    expect(endpointsModule.id).toBe('endpoints-manager');
  });

  it('has the correct name', () => {
    expect(endpointsModule.name).toBe('Custom Endpoints');
  });

  it('has version 1.0.0', () => {
    expect(endpointsModule.version).toBe('1.0.0');
  });

  it('registers EndpointsWidget', () => {
    expect(endpointsModule.widgets).toBeDefined();
    const widget = endpointsModule.widgets!.find((w) => w.component === 'EndpointsWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('endpoints-overview');
  });

  it('registers /endpoints route', () => {
    expect(endpointsModule.routes).toBeDefined();
    const route = endpointsModule.routes!.find((r) => r.path === '/endpoints');
    expect(route).toBeDefined();
    expect(route!.component).toBe('EndpointsPage');
    expect(route!.name).toBe('Endpoints');
  });

  describe('lifecycle hooks', () => {
    it('init() calls logger.info', () => {
      const ctx = makeCtx();
      endpointsModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('start() calls logger.info', () => {
      const ctx = makeCtx();
      endpointsModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('stop() calls logger.info', () => {
      const ctx = makeCtx();
      endpointsModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });
  });
});
