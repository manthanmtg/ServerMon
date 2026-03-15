/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Module } from '@/types/module';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockTrack, mockEmit, mockOn } = vi.hoisted(() => ({
  mockTrack: vi.fn().mockResolvedValue(undefined),
  mockEmit: vi.fn(),
  mockOn: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  analyticsService: { track: mockTrack },
  AnalyticsService: { getInstance: () => ({ track: mockTrack }) },
}));

vi.mock('./EventBus', () => ({
  eventBus: { emit: mockEmit, on: mockOn, removeAllListeners: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeModule = (id: string, overrides: Partial<Module> = {}): Module => ({
  id,
  name: `Module ${id}`,
  version: '1.0.0',
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ModuleRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('register()', () => {
    it('stores the module so getModule() can retrieve it', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const mod = makeModule('test-mod');

      await moduleRegistry.register(mod);

      expect(moduleRegistry.getModule('test-mod')).toBe(mod);
    });

    it('calls module.init with a context when provided', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const initFn = vi.fn().mockResolvedValue(undefined);
      const mod = makeModule('init-mod', { init: initFn });

      await moduleRegistry.register(mod);

      expect(initFn).toHaveBeenCalledOnce();
      expect(initFn).toHaveBeenCalledWith(
        expect.objectContaining({
          analytics: expect.any(Object),
          events: expect.any(Object),
          logger: expect.any(Object),
          system: expect.any(Object),
          settings: expect.any(Object),
        })
      );
    });

    it('emits module:loaded event on the eventBus after registering', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const mod = makeModule('emit-mod');

      await moduleRegistry.register(mod);

      expect(mockEmit).toHaveBeenCalledWith('module:loaded', {
        id: 'emit-mod',
        name: 'Module emit-mod',
      });
    });

    it('tracks a module:registered analytics event', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const mod = makeModule('analytics-mod');

      await moduleRegistry.register(mod);

      expect(mockTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: 'core',
          event: 'module:registered',
          metadata: expect.objectContaining({ id: 'analytics-mod' }),
        })
      );
    });

    it('warns and skips re-registration when the same id is registered twice', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mod = makeModule('dup-mod');

      await moduleRegistry.register(mod);
      await moduleRegistry.register(mod);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dup-mod'));
      // Still only one module with that id
      expect(moduleRegistry.getAllModules().filter((m) => m.id === 'dup-mod')).toHaveLength(1);
      warnSpy.mockRestore();
    });

    it('works without an init hook', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const mod = makeModule('no-init');

      await expect(moduleRegistry.register(mod)).resolves.toBeUndefined();
      expect(moduleRegistry.getModule('no-init')).toBe(mod);
    });
  });

  describe('start()', () => {
    it('calls module.start with the context', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const startFn = vi.fn().mockResolvedValue(undefined);
      const mod = makeModule('start-mod', { start: startFn });

      await moduleRegistry.register(mod);
      await moduleRegistry.start('start-mod');

      expect(startFn).toHaveBeenCalledOnce();
      expect(startFn).toHaveBeenCalledWith(expect.any(Object));
    });

    it('emits module:started event on the eventBus', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const mod = makeModule('started-mod', { start: vi.fn() });

      await moduleRegistry.register(mod);
      vi.clearAllMocks();
      await moduleRegistry.start('started-mod');

      expect(mockEmit).toHaveBeenCalledWith('module:started', { id: 'started-mod' });
    });

    it('tracks a module:started analytics event', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const mod = makeModule('track-start', { start: vi.fn() });

      await moduleRegistry.register(mod);
      vi.clearAllMocks();
      await moduleRegistry.start('track-start');

      expect(mockTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'module:started',
          metadata: { id: 'track-start' },
        })
      );
    });

    it('does nothing when the module id is unknown', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');

      await expect(moduleRegistry.start('nonexistent')).resolves.toBeUndefined();
      expect(mockEmit).not.toHaveBeenCalledWith('module:started', expect.anything());
    });

    it('does nothing when the module has no start hook', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const mod = makeModule('no-start');

      await moduleRegistry.register(mod);
      vi.clearAllMocks();
      await moduleRegistry.start('no-start');

      expect(mockEmit).not.toHaveBeenCalledWith('module:started', expect.anything());
    });
  });

  describe('stop()', () => {
    it('calls module.stop with the context', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const stopFn = vi.fn().mockResolvedValue(undefined);
      const mod = makeModule('stop-mod', { stop: stopFn });

      await moduleRegistry.register(mod);
      await moduleRegistry.stop('stop-mod');

      expect(stopFn).toHaveBeenCalledOnce();
    });

    it('emits module:stopped event on the eventBus', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const mod = makeModule('stopped-mod', { stop: vi.fn() });

      await moduleRegistry.register(mod);
      vi.clearAllMocks();
      await moduleRegistry.stop('stopped-mod');

      expect(mockEmit).toHaveBeenCalledWith('module:stopped', { id: 'stopped-mod' });
    });

    it('does nothing when the module has no stop hook', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const mod = makeModule('no-stop');

      await moduleRegistry.register(mod);
      vi.clearAllMocks();
      await moduleRegistry.stop('no-stop');

      expect(mockEmit).not.toHaveBeenCalledWith('module:stopped', expect.anything());
    });
  });

  describe('getAllModules()', () => {
    it('returns all registered modules', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const a = makeModule('all-a');
      const b = makeModule('all-b');

      await moduleRegistry.register(a);
      await moduleRegistry.register(b);

      const all = moduleRegistry.getAllModules();
      expect(all).toContain(a);
      expect(all).toContain(b);
    });

    it('returns an empty array when no modules are registered', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      expect(moduleRegistry.getAllModules()).toEqual([]);
    });
  });

  describe('getModule()', () => {
    it('returns undefined for an unknown id', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      expect(moduleRegistry.getModule('ghost')).toBeUndefined();
    });
  });

  describe('ModuleContext', () => {
    it('provides system capabilities with platform and cpu count', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const initFn = vi.fn();
      await moduleRegistry.register(makeModule('ctx-mod', { init: initFn }));

      const ctx = initFn.mock.calls[0][0];
      expect(typeof ctx.system.capabilities.platform).toBe('string');
      expect(typeof ctx.system.capabilities.cpus).toBe('number');
      expect(ctx.system.capabilities.cpus).toBeGreaterThan(0);
    });

    it('provides a settings.get that returns null and settings.set that resolves', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const initFn = vi.fn();
      await moduleRegistry.register(makeModule('settings-mod', { init: initFn }));

      const ctx = initFn.mock.calls[0][0];
      await expect(ctx.settings.get('some_key')).resolves.toBeNull();
      await expect(ctx.settings.set('some_key', 'value')).resolves.toBeUndefined();
    });

    it('context.events.emit delegates to eventBus.emit', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const initFn = vi.fn();
      await moduleRegistry.register(makeModule('events-mod', { init: initFn }));

      const ctx = initFn.mock.calls[0][0];
      ctx.events.emit('custom:event', { data: 1 });

      expect(mockEmit).toHaveBeenCalledWith('custom:event', { data: 1 });
    });

    it('context.analytics.track calls analyticsService.track', async () => {
      const { moduleRegistry } = await import('./ModuleRegistry');
      const initFn = vi.fn();
      await moduleRegistry.register(makeModule('analytics-ctx-mod', { init: initFn }));

      const ctx = initFn.mock.calls[0][0];
      vi.clearAllMocks();
      ctx.analytics.track('user:action', { key: 'val' });

      expect(mockTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'user:action',
          metadata: { key: 'val' },
        })
      );
    });
  });
});
