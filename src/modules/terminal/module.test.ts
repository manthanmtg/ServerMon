/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { terminalModule } from './module';
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

describe('terminalModule definition', () => {
  it('has id "terminal"', () => {
    expect(terminalModule.id).toBe('terminal');
  });

  it('has the correct name', () => {
    expect(terminalModule.name).toBe('Terminal');
  });

  it('has version 1.0.0', () => {
    expect(terminalModule.version).toBe('1.0.0');
  });

  it('has no dashboard widget', () => {
    expect(terminalModule.widgets).toBeUndefined();
  });

  it('registers /terminal route', () => {
    expect(terminalModule.routes).toBeDefined();
    const route = terminalModule.routes!.find((r) => r.path === '/terminal');
    expect(route).toBeDefined();
    expect(route!.component).toBe('TerminalPage');
    expect(route!.name).toBe('Terminal');
  });

  describe('lifecycle hooks', () => {
    it('init() calls logger.info', () => {
      const ctx = makeCtx();
      terminalModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('start() calls logger.info', () => {
      const ctx = makeCtx();
      terminalModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('stop() calls logger.info', () => {
      const ctx = makeCtx();
      terminalModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });
  });
});
