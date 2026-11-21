import { Module, ModuleContext } from '@/types/module';

export const appsModule: Module = {
  id: 'apps',
  name: 'Apps',
  version: '0.1.0',
  description: 'Deploy and operate local Next.js applications from managed release copies.',

  widgets: [
    {
      id: 'apps-overview',
      name: 'Apps Overview',
      component: 'AppsWidget',
    },
  ],

  routes: [
    {
      path: '/apps',
      component: 'AppsPage',
      name: 'Apps',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Apps module...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Apps module started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Apps module stopped.');
  },
};
