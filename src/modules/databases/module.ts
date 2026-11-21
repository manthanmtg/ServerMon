import { Module, ModuleContext } from '@/types/module';

export const databasesModule: Module = {
  id: 'databases',
  name: 'Databases',
  version: '0.1.0',
  description: 'Deploy and operate Docker-based MongoDB, PostgreSQL, and MySQL databases.',

  widgets: [
    {
      id: 'databases-overview',
      name: 'Databases Overview',
      component: 'DatabasesWidget',
    },
  ],

  routes: [
    {
      path: '/databases',
      component: 'DatabasesPage',
      name: 'Databases',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Databases module...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Databases module started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Databases module stopped.');
  },
};
