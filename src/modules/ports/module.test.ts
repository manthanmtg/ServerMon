/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { portsModule } from './module';
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

describe('portsModule', () => {
  it('has the correct id', () => {
    expect(portsModule.id).toBe('ports-monitor');
  });

  it('has the correct name', () => {
    expect(portsModule.name).toBe('Ports Monitor');
  });

  it('has version 1.0.0', () => {
    expect(portsModule.version).toBe('1.0.0');
  });

  it('registers the PortsWidget widget', () => {
    expect(portsModule.widgets).toBeDefined();
    const widget = portsModule.widgets!.find((w) => w.component === 'PortsWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('ports-overview');
  });

  it('registers the /ports route', () => {
    expect(portsModule.routes).toBeDefined();
    const route = portsModule.routes!.find((r) => r.path === '/ports');
    expect(route).toBeDefined();
    expect(route!.component).toBe('PortsPage');
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      portsModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      const ctx = makeCtx();
      portsModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      portsModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
    });
  });
});
