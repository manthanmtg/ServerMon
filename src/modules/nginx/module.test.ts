/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { nginxModule } from './module';
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

describe('nginxModule', () => {
  it('has the correct id', () => {
    expect(nginxModule.id).toBe('nginx-manager');
  });

  it('has the correct name', () => {
    expect(nginxModule.name).toBe('Nginx Manager');
  });

  it('has version 1.0.0', () => {
    expect(nginxModule.version).toBe('1.0.0');
  });

  it('registers the NginxWidget widget', () => {
    expect(nginxModule.widgets).toBeDefined();
    const widget = nginxModule.widgets!.find((w) => w.component === 'NginxWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('nginx-overview');
  });

  it('registers the /nginx route', () => {
    expect(nginxModule.routes).toBeDefined();
    const route = nginxModule.routes!.find((r) => r.path === '/nginx');
    expect(route).toBeDefined();
    expect(route!.component).toBe('NginxPage');
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      nginxModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      const ctx = makeCtx();
      nginxModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      nginxModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
    });
  });
});
