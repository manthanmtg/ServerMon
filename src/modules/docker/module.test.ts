/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { dockerModule } from './module';
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

describe('dockerModule definition', () => {
  it('has id "docker-monitor"', () => {
    expect(dockerModule.id).toBe('docker-monitor');
  });

  it('has the correct name', () => {
    expect(dockerModule.name).toBe('Docker Monitor');
  });

  it('has version 1.0.0', () => {
    expect(dockerModule.version).toBe('1.0.0');
  });

  it('has no dashboard widget (page only)', () => {
    expect(dockerModule.widgets).toBeUndefined();
  });

  it('registers /docker route', () => {
    expect(dockerModule.routes).toBeDefined();
    const route = dockerModule.routes!.find((r) => r.path === '/docker');
    expect(route).toBeDefined();
    expect(route!.component).toBe('DockerPage');
    expect(route!.name).toBe('Docker');
  });

  describe('lifecycle hooks', () => {
    it('init() calls logger.info', () => {
      const ctx = makeCtx();
      dockerModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('start() calls logger.info', () => {
      const ctx = makeCtx();
      dockerModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('stop() calls logger.info', () => {
      const ctx = makeCtx();
      dockerModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });
  });
});
