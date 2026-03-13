import { Module, ModuleContext } from '@/types/module';

export const portsModule: Module = {
    id: 'ports-monitor',
    name: 'Ports Monitor',
    version: '1.0.0',
    description: 'Monitor listening ports, check port availability, and view firewall rules.',

    widgets: [
        {
            id: 'ports-overview',
            name: 'Ports Overview',
            component: 'PortsWidget',
        },
    ],

    routes: [
        {
            path: '/ports',
            component: 'PortsPage',
            name: 'Ports',
        },
    ],

    init: (ctx: ModuleContext) => {
        ctx.logger.info('Initializing Ports Monitor...');
    },

    start: (ctx: ModuleContext) => {
        ctx.logger.info('Ports Monitor Started.');
    },

    stop: (ctx: ModuleContext) => {
        ctx.logger.info('Ports Monitor Stopped.');
    },
};
