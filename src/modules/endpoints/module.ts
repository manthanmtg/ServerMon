import { Module, ModuleContext } from '@/types/module';

export const endpointsModule: Module = {
  id: 'endpoints-manager',
  name: 'Custom Endpoints',
  version: '1.0.0',
  description:
    'Define, manage, and execute custom API endpoints with scripts, logic handlers, and webhook proxying.',

  widgets: [
    {
      id: 'endpoints-overview',
      name: 'Endpoints Overview',
      component: 'EndpointsWidget',
    },
  ],

  routes: [
    {
      path: '/endpoints',
      component: 'EndpointsPage',
      name: 'Endpoints',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Custom Endpoints Manager...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Custom Endpoints Manager Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Custom Endpoints Manager Stopped.');
  },
};
