import { Module, ModuleContext } from '@/types/module';
import { eventBus } from './EventBus';
import { analyticsService } from '../analytics';
import os from 'os';

class ModuleRegistry {
  private static instance: ModuleRegistry;
  private modules: Map<string, Module> = new Map();
  private contexts: Map<string, ModuleContext> = new Map();

  private constructor() {}

  public static getInstance(): ModuleRegistry {
    if (!ModuleRegistry.instance) {
      ModuleRegistry.instance = new ModuleRegistry();
    }
    return ModuleRegistry.instance;
  }

  /**
   * Register and initialize a module
   */
  public async register(mod: Module): Promise<void> {
    if (this.modules.has(mod.id)) {
      console.warn(`Module with id ${mod.id} is already registered.`);
      return;
    }

    const ctx = this.createContext(mod);
    this.modules.set(mod.id, mod);
    this.contexts.set(mod.id, ctx);

    if (mod.init) {
      await mod.init(ctx);
    }

    console.log(`Module loaded: ${mod.name} (v${mod.version})`);
    eventBus.emit('module:loaded', { id: mod.id, name: mod.name });

    // Log registration
    await analyticsService.track({
      moduleId: 'core',
      event: 'module:registered',
      metadata: { id: mod.id, name: mod.name, version: mod.version },
      severity: 'info',
    });
  }

  /**
   * Start a module
   */
  public async start(id: string): Promise<void> {
    const mod = this.modules.get(id);
    const ctx = this.contexts.get(id);
    if (mod && ctx && mod.start) {
      await mod.start(ctx);
      eventBus.emit('module:started', { id });

      await analyticsService.track({
        moduleId: 'core',
        event: 'module:started',
        metadata: { id },
        severity: 'info',
      });
    }
  }

  /**
   * Stop a module
   */
  public async stop(id: string): Promise<void> {
    const mod = this.modules.get(id);
    const ctx = this.contexts.get(id);
    if (mod && ctx && mod.stop) {
      await mod.stop(ctx);
      eventBus.emit('module:stopped', { id });

      await analyticsService.track({
        moduleId: 'core',
        event: 'module:stopped',
        metadata: { id },
        severity: 'info',
      });
    }
  }

  public getModule(id: string): Module | undefined {
    return this.modules.get(id);
  }

  public getAllModules(): Module[] {
    return Array.from(this.modules.values());
  }

  private createContext(mod: Module): ModuleContext {
    return {
      analytics: {
        track: (event, metadata) => {
          eventBus.emit('analytics:event', { moduleId: mod.id, event, metadata });
          analyticsService.track({
            moduleId: mod.id,
            event,
            metadata: metadata as Record<string, unknown>,
            severity: 'info',
          });
        },
      },
      events: {
        emit: (event, data) => eventBus.emit(event, data),
        on: (event, callback) => eventBus.on(event, callback),
      },
      db: {
        getCollection: (_name) => {
          return null;
        },
      },
      logger: {
        info: (msg, ...args) => {
          analyticsService.track({
            moduleId: mod.id,
            event: 'log:info',
            metadata: { msg, args },
            severity: 'info',
          });
        },
        warn: (msg, ...args) => {
          analyticsService.track({
            moduleId: mod.id,
            event: 'log:warn',
            metadata: { msg, args },
            severity: 'warn',
          });
        },
        error: (msg, ...args) => {
          analyticsService.track({
            moduleId: mod.id,
            event: 'log:error',
            metadata: { msg, args },
            severity: 'error',
          });
        },
      },
      system: {
        capabilities: {
          platform: process.platform,
          arch: process.arch,
          cpus: os.cpus().length,
          memory: os.totalmem(),
        },
      },
      settings: {
        get: async (_key) => {
          return null;
        },
        set: async (_key, _value) => {},
      },
      ui: {
        theme: {
          id: 'dark-default',
          mode: 'dark',
        },
      },
    };
  }
}

export const moduleRegistry = ModuleRegistry.getInstance();
