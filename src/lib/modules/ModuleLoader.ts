import { moduleRegistry } from './ModuleRegistry';
import { coreModules } from '@/modules';

export async function initializeModules() {
    console.log('--- Initializing Modules ---');
    for (const mod of coreModules) {
        await moduleRegistry.register(mod);
    }

    // Start all enabled modules
    const modules = moduleRegistry.getAllModules();
    for (const m of modules) {
        await moduleRegistry.start(m.id);
    }
}
