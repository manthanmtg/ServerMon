/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { diskModule } from './module';
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

describe('diskModule definition', () => {
  it('has id "disk-monitor"', () => {
    expect(diskModule.id).toBe('disk-monitor');
  });

  it('has the correct name', () => {
    expect(diskModule.name).toBe('Disk Monitor');
  });

  it('has version 1.0.0', () => {
    expect(diskModule.version).toBe('1.0.0');
  });

  it('registers DiskWidget', () => {
    expect(diskModule.widgets).toBeDefined();
    const widget = diskModule.widgets!.find((w) => w.component === 'DiskWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('disk-usage-summary');
  });

  it('registers /disk route', () => {
    expect(diskModule.routes).toBeDefined();
    const route = diskModule.routes!.find((r) => r.path === '/disk');
    expect(route).toBeDefined();
    expect(route!.component).toBe('DiskPage');
    expect(route!.name).toBe('Disk');
  });

  describe('lifecycle hooks', () => {
    it('init() calls logger.info', () => {
      const ctx = makeCtx();
      diskModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('start() calls logger.info', () => {
      const ctx = makeCtx();
      diskModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('stop() calls logger.info', () => {
      const ctx = makeCtx();
      diskModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });
  });
});
