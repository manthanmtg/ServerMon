import { Module, ModuleContext } from '@/types/module';

export const nginxModule: Module = {
    id: 'nginx-manager',
    name: 'Nginx Manager',
    version: '1.0.0',
    description: 'Manage Nginx reverse proxy, virtual hosts, config validation, and logs.',

    widgets: [
        {
            id: 'nginx-overview',
            name: 'Nginx Overview',
            component: 'NginxWidget',
        },
    ],

    routes: [
        {
            path: '/nginx',
            component: 'NginxPage',
            name: 'Nginx',
        },
    ],

    init: (ctx: ModuleContext) => {
        ctx.logger.info('Initializing Nginx Manager...');
    },

    start: (ctx: ModuleContext) => {
        ctx.logger.info('Nginx Manager Started.');
    },

    stop: (ctx: ModuleContext) => {
        ctx.logger.info('Nginx Manager Stopped.');
    },
};
