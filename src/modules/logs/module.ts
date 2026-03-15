import { Module, ModuleContext } from '@/types/module';

export const logsModule: Module = {
  id: 'system-logs',
  name: 'System Logs',
  version: '1.0.0',
  description: 'Auditing and event logging system.',

  widgets: [
    {
      id: 'recent-logs',
      name: 'Recent Activity',
      component: 'LogsWidget',
    },
  ],

  routes: [
    {
      path: '/logs',
      component: 'LogsPage',
      name: 'Logs',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Logging Module...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Logging Service Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Logging Service Stopped.');
  },
};
