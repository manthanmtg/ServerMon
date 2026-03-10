import { Module, ModuleContext } from '@/types/module';
import { eventBus } from './EventBus';
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
                    console.log(`[Analytics] ${module.id}: ${event}`, metadata);
                    eventBus.emit('analytics:event', { moduleId: module.id, event, metadata });
                },
            },
            events: {
                emit: (event, data) => eventBus.emit(event, data),
                on: (event, callback) => eventBus.on(event, callback),
            },
            db: {
                getCollection: (name) => {
                    // Placeholder for MongoDB collection access
                    return null;
                },
            },
            logger: {
                info: (msg, ...args) => console.log(`[INFO] [${module.name}] ${msg}`, ...args),
                warn: (msg, ...args) => console.warn(`[WARN] [${module.name}] ${msg}`, ...args),
                error: (msg, ...args) => console.error(`[ERROR] [${module.name}] ${msg}`, ...args),
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
                    // Placeholder for settings retrieval
                    return null;
                },
                set: async (key, value) => {
                    // Placeholder for settings persistence
                },
            },
            ui: {
                theme: {
                    id: 'dark-default', // Initial default
                    mode: 'dark',
                },
            },
        };
    }
}

export const moduleRegistry = ModuleRegistry.getInstance();
