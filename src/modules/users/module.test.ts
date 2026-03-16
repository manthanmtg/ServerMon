/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { usersModule } from './module';
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

describe('usersModule', () => {
  it('has the correct id', () => {
    expect(usersModule.id).toBe('users-permissions');
  });

  it('has the correct name', () => {
    expect(usersModule.name).toBe('Users & Permissions');
  });

  it('has version 1.0.0', () => {
    expect(usersModule.version).toBe('1.0.0');
  });

  it('registers the UsersWidget widget', () => {
    expect(usersModule.widgets).toBeDefined();
    const widget = usersModule.widgets!.find((w) => w.component === 'UsersWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('users-overview');
  });

  it('registers the /users route', () => {
    expect(usersModule.routes).toBeDefined();
    const route = usersModule.routes!.find((r) => r.path === '/users');
    expect(route).toBeDefined();
    expect(route!.component).toBe('UsersPage');
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      usersModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      const ctx = makeCtx();
      usersModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      usersModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
    });
  });
});
