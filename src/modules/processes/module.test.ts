/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { processModule } from './module';
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

describe('processModule', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('has the correct id', () => {
    expect(processModule.id).toBe('process-monitor');
  });

  it('has the correct name', () => {
    expect(processModule.name).toBe('Process Monitor');
  });

  it('has version 1.0.0', () => {
    expect(processModule.version).toBe('1.0.0');
  });

  it('registers the ProcessWidget widget', () => {
    expect(processModule.widgets).toBeDefined();
    const widget = processModule.widgets!.find((w) => w.component === 'ProcessWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('top-processes');
  });

  it('registers the process API route', () => {
    expect(processModule.routes).toBeDefined();
    expect(processModule.routes!.length).toBeGreaterThan(0);
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      processModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      vi.useFakeTimers();
      const ctx = makeCtx();
      processModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      processModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
    });
  });
});
