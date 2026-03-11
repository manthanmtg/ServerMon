import { Module, ModuleContext } from '@/types/module';

export const fileBrowserModule: Module = {
    id: 'file-browser',
    name: 'File Browser',
    version: '1.0.0',
    description: 'Secure file navigation, preview, editing, and uploads for server administration.',

    routes: [
        {
            path: '/file-browser',
            component: 'FileBrowserPage',
            name: 'File Browser',
        },
    ],

    init: (ctx: ModuleContext) => {
        ctx.logger.info('Initializing File Browser module');
    },

    start: (ctx: ModuleContext) => {
        ctx.logger.info('File Browser module started');
    },

    stop: (ctx: ModuleContext) => {
        ctx.logger.info('File Browser module stopped');
    },
};
