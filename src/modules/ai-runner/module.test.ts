/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { aiRunnerModule } from './module';
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

describe('aiRunnerModule definition', () => {
  it('has id "ai-runner"', () => {
    expect(aiRunnerModule.id).toBe('ai-runner');
  });

  it('registers AIRunnerWidget', () => {
    expect(aiRunnerModule.widgets?.some((widget) => widget.component === 'AIRunnerWidget')).toBe(
      true
    );
  });

  it('registers /ai-runner route', () => {
    expect(aiRunnerModule.routes?.some((route) => route.path === '/ai-runner')).toBe(true);
  });

  it('logs through lifecycle hooks', () => {
    const ctx = makeCtx();
    aiRunnerModule.init?.(ctx);
    aiRunnerModule.start?.(ctx);
    aiRunnerModule.stop?.(ctx);
    expect(ctx.logger.info).toHaveBeenCalledTimes(3);
  });
});
