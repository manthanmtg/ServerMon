/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { securityModule } from './module';
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

describe('securityModule definition', () => {
  it('has id "security-audit"', () => {
    expect(securityModule.id).toBe('security-audit');
  });

  it('has the correct name', () => {
    expect(securityModule.name).toBe('Security Audit');
  });

  it('has version 1.0.0', () => {
    expect(securityModule.version).toBe('1.0.0');
  });

  it('registers SecurityWidget', () => {
    expect(securityModule.widgets).toBeDefined();
    const widget = securityModule.widgets!.find((w) => w.component === 'SecurityWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('security-overview');
  });

  it('registers /security route', () => {
    expect(securityModule.routes).toBeDefined();
    const route = securityModule.routes!.find((r) => r.path === '/security');
    expect(route).toBeDefined();
    expect(route!.component).toBe('SecurityPage');
    expect(route!.name).toBe('Security');
  });

  describe('lifecycle hooks', () => {
    it('init() calls logger.info', () => {
      const ctx = makeCtx();
      securityModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('start() calls logger.info', () => {
      const ctx = makeCtx();
      securityModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('stop() calls logger.info', () => {
      const ctx = makeCtx();
      securityModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });
  });
});
