import { Module, ModuleContext } from '@/types/module';

export const servicesModule: Module = {
    id: 'services-monitor',
    name: 'Services Monitor',
    version: '1.0.0',
    description: 'Monitor systemd services, their status, resource usage, uptime, and alerts.',

    widgets: [
        {
            id: 'services-overview',
            name: 'Services Overview',
            component: 'ServicesWidget',
        },
    ],

    routes: [
        {
            path: '/services',
            component: 'ServicesPage',
            name: 'Services',
        },
    ],

    init: (ctx: ModuleContext) => {
        ctx.logger.info('Initializing Services Monitor...');
    },

    start: (ctx: ModuleContext) => {
        ctx.logger.info('Services Monitor Started.');
    },

    stop: (ctx: ModuleContext) => {
        ctx.logger.info('Services Monitor Stopped.');
    },
};
