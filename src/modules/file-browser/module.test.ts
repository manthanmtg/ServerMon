/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { fileBrowserModule } from './module';
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

describe('fileBrowserModule', () => {
  it('has the correct id', () => {
    expect(fileBrowserModule.id).toBe('file-browser');
  });

  it('has the correct name', () => {
    expect(fileBrowserModule.name).toBe('File Browser');
  });

  it('has version 1.0.0', () => {
    expect(fileBrowserModule.version).toBe('1.0.0');
  });

  it('has no widgets (page-only module)', () => {
    expect(fileBrowserModule.widgets).toBeUndefined();
  });

  it('registers the /file-browser route', () => {
    expect(fileBrowserModule.routes).toBeDefined();
    const route = fileBrowserModule.routes!.find((r) => r.path === '/file-browser');
    expect(route).toBeDefined();
    expect(route!.component).toBe('FileBrowserPage');
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      fileBrowserModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      const ctx = makeCtx();
      fileBrowserModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('started'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      fileBrowserModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('stopped'));
    });
  });
});
