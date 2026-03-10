import { moduleRegistry } from './ModuleRegistry';
import { coreModules } from '@/modules';

export async function initializeModules() {
    console.log('--- Initializing Modules ---');
    for (const module of coreModules) {
        await moduleRegistry.register(module);
    }

    // Start all enabled modules
    const modules = moduleRegistry.getAllModules();
    for (const m of modules) {
        await moduleRegistry.start(m.id);
    }
}
