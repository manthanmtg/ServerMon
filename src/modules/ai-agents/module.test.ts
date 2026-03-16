/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { aiAgentsModule } from './module';
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

describe('aiAgentsModule definition', () => {
  it('has id "ai-agents"', () => {
    expect(aiAgentsModule.id).toBe('ai-agents');
  });

  it('has the correct name', () => {
    expect(aiAgentsModule.name).toBe('AI Agents');
  });

  it('has version 1.0.0', () => {
    expect(aiAgentsModule.version).toBe('1.0.0');
  });

  it('registers AIAgentsWidget', () => {
    expect(aiAgentsModule.widgets).toBeDefined();
    const widget = aiAgentsModule.widgets!.find((w) => w.component === 'AIAgentsWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('ai-agents-overview');
  });

  it('registers /ai-agents route', () => {
    expect(aiAgentsModule.routes).toBeDefined();
    const route = aiAgentsModule.routes!.find((r) => r.path === '/ai-agents');
    expect(route).toBeDefined();
    expect(route!.component).toBe('AIAgentsPage');
  });

  describe('lifecycle hooks', () => {
    it('init() calls logger.info', () => {
      const ctx = makeCtx();
      aiAgentsModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('start() calls logger.info', () => {
      const ctx = makeCtx();
      aiAgentsModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });

    it('stop() calls logger.info', () => {
      const ctx = makeCtx();
      aiAgentsModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledOnce();
    });
  });
});
