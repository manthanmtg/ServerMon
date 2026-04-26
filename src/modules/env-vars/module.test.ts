/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import type { ModuleContext } from '@/types/module';
import { envVarsModule } from './module';

function makeCtx(): ModuleContext {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    events: { emit: vi.fn(), on: vi.fn() },
    analytics: { track: vi.fn() },
    db: { getCollection: vi.fn() },
    system: { capabilities: { platform: 'darwin', arch: 'arm64', cpus: 10, memory: 16 } },
    settings: { get: vi.fn(), set: vi.fn() },
    ui: { theme: { id: 'default', mode: 'dark' } },
  };
}

describe('envVarsModule', () => {
  it('registers module metadata', () => {
    expect(envVarsModule.id).toBe('env-vars');
    expect(envVarsModule.name).toBe('EnvVars');
    expect(envVarsModule.version).toBe('1.0.0');
  });

  it('registers the page and widget', () => {
    expect(envVarsModule.routes?.[0]).toMatchObject({
      path: '/env-vars',
      component: 'EnvVarsPage',
      name: 'EnvVars',
    });
    expect(envVarsModule.widgets?.[0]).toMatchObject({
      id: 'env-vars-overview',
      component: 'EnvVarsWidget',
    });
  });

  it('logs lifecycle events', () => {
    const ctx = makeCtx();
    envVarsModule.init?.(ctx);
    envVarsModule.start?.(ctx);
    envVarsModule.stop?.(ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
  });
});
