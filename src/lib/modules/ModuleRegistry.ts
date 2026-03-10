import { Module, ModuleContext } from '@/types/module';
import { eventBus } from './EventBus';
import { analyticsService } from '../analytics';
import os from 'os';

class ModuleRegistry {
    private static instance: ModuleRegistry;
    private modules: Map<string, Module> = new Map();
    private contexts: Map<string, ModuleContext> = new Map();

    private constructor() { }

    public static getInstance(): ModuleRegistry {
        if (!ModuleRegistry.instance) {
            ModuleRegistry.instance = new ModuleRegistry();
        }
        return ModuleRegistry.instance;
    }

    /**
     * Register and initialize a module
     */
    public async register(module: Module): Promise<void> {
        if (this.modules.has(module.id)) {
            console.warn(`Module with id ${module.id} is already registered.`);
            return;
        }

        const ctx = this.createContext(module);
        this.modules.set(module.id, module);
        this.contexts.set(module.id, ctx);

        if (module.init) {
            await module.init(ctx);
        }

        console.log(`Module loaded: ${module.name} (v${module.version})`);
        eventBus.emit('module:loaded', { id: module.id, name: module.name });

        // Log registration
        await analyticsService.track({
            moduleId: 'core',
            event: 'module:registered',
            metadata: { id: module.id, name: module.name, version: module.version },
            severity: 'info'
        });
    }

    /**
     * Start a module
     */
    public async start(id: string): Promise<void> {
        const module = this.modules.get(id);
        const ctx = this.contexts.get(id);
        if (module && ctx && module.start) {
            await module.start(ctx);
            eventBus.emit('module:started', { id });

            await analyticsService.track({
                moduleId: 'core',
                event: 'module:started',
                metadata: { id },
                severity: 'info'
            });
        }
    }

    /**
     * Stop a module
     */
    public async stop(id: string): Promise<void> {
        const module = this.modules.get(id);
        const ctx = this.contexts.get(id);
        if (module && ctx && module.stop) {
            await module.stop(ctx);
            eventBus.emit('module:stopped', { id });

            await analyticsService.track({
                moduleId: 'core',
                event: 'module:stopped',
                metadata: { id },
                severity: 'info'
            });
        }
    }

    public getModule(id: string): Module | undefined {
        return this.modules.get(id);
    }

    public getAllModules(): Module[] {
        return Array.from(this.modules.values());
    }

    private createContext(module: Module): ModuleContext {
        return {
            analytics: {
                track: (event, metadata) => {
                    eventBus.emit('analytics:event', { moduleId: module.id, event, metadata });
                    analyticsService.track({
                        moduleId: module.id,
                        event,
                        metadata,
                        severity: 'info'
                    });
                },
            },
            events: {
                emit: (event, data) => eventBus.emit(event, data),
                on: (event, callback) => eventBus.on(event, callback),
            },
            db: {
                getCollection: (name) => {
                    return null;
                },
            },
            logger: {
                info: (msg, ...args) => {
                    analyticsService.track({ moduleId: module.id, event: 'log:info', metadata: { msg, args }, severity: 'info' });
                },
                warn: (msg, ...args) => {
                    analyticsService.track({ moduleId: module.id, event: 'log:warn', metadata: { msg, args }, severity: 'warn' });
                },
                error: (msg, ...args) => {
                    analyticsService.track({ moduleId: module.id, event: 'log:error', metadata: { msg, args }, severity: 'error' });
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
                get: async (key) => {
                    return null;
                },
                set: async (key, value) => {
                },
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
