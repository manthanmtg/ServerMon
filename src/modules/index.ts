import { Module } from '@/types/module';
import { healthModule } from './health/module';

// For now, we will manually register modules here.
// In the future, this could be a dynamic scan of the modules directory.
export const coreModules: Module[] = [
    healthModule,
];
