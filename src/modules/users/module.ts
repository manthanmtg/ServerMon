import { Module, ModuleContext } from '@/types/module';

export const usersModule: Module = {
    id: 'users-permissions',
    name: 'Users & Permissions',
    version: '1.0.0',
    description: 'Manage system users, SSH access, sudo privileges, and ServerMon web access controls.',

    widgets: [
        {
            id: 'users-overview',
            name: 'Users & Access',
            component: 'UsersWidget',
        },
    ],

    routes: [
        {
            path: '/users',
            component: 'UsersPage',
            name: 'Users',
        },
    ],

    init: (ctx: ModuleContext) => {
        ctx.logger.info('Initializing Users & Permissions Module...');
    },

    start: (ctx: ModuleContext) => {
        ctx.logger.info('Users & Permissions Module Started.');
    },

    stop: (ctx: ModuleContext) => {
        ctx.logger.info('Users & Permissions Module Stopped.');
    },
};
