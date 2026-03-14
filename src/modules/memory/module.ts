import { Module, ModuleContext } from '@/types/module';

export const memoryModule: Module = {
    id: 'memory-monitor',
    name: 'Memory Monitor',
    version: '1.0.0',
    description: 'Detailed RAM and Swap usage analysis, pressure monitoring, and process tracking.',

    widgets: [
        {
            id: 'memory-detailed',
            name: 'Memory Health',
            component: 'MemoryWidget',
        },
    ],

    routes: [
        {
            path: '/memory',
            component: 'MemoryPage',
            name: 'Memory',
        },
    ],

    init: (ctx: ModuleContext) => {
        ctx.logger.info('Initializing Memory Monitor Module...');
    },

    start: (ctx: ModuleContext) => {
        ctx.logger.info('Memory Monitor Started.');
    },

    stop: (ctx: ModuleContext) => {
        ctx.logger.info('Memory Monitor Stopped.');
    },
};
