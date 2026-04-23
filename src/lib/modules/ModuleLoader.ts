import { moduleRegistry } from './ModuleRegistry';
import { coreModules } from '@/modules';
import { createLogger } from '../logger';

const logger = createLogger('ModuleLoader');

export async function initializeModules() {
  logger.info('--- Initializing Modules ---');
  for (const mod of coreModules) {
    await moduleRegistry.register(mod);
  }

  // Start all enabled modules
  const modules = moduleRegistry.getAllModules();
  for (const m of modules) {
    await moduleRegistry.start(m.id);
  }
}
