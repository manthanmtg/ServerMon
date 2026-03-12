import { Module, ModuleContext } from '@/types/module';

export const aiAgentsModule: Module = {
    id: 'ai-agents',
    name: 'AI Agents',
    version: '1.0.0',
    description: 'Monitor and manage AI coding agent sessions running on the server.',

    widgets: [
        {
            id: 'ai-agents-overview',
            name: 'AI Agents Overview',
            component: 'AIAgentsWidget',
        },
    ],

    routes: [
        {
            path: '/ai-agents',
            component: 'AIAgentsPage',
            name: 'AI Agents',
        },
    ],

    init: (ctx: ModuleContext) => {
        ctx.logger.info('Initializing AI Agents Module...');
    },

    start: (ctx: ModuleContext) => {
        ctx.logger.info('AI Agents Module Started.');
    },

    stop: (ctx: ModuleContext) => {
        ctx.logger.info('AI Agents Module Stopped.');
    },
};
