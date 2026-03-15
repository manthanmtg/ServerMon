import { Module, ModuleContext } from '@/types/module';

export const cronsModule: Module = {
  id: 'crons-manager',
  name: 'Cron Jobs Manager',
  version: '1.0.0',
  description: 'Manage and monitor cron jobs, schedules, and execution history.',

  widgets: [
    {
      id: 'crons-overview',
      name: 'Crons Overview',
      component: 'CronsWidget',
    },
  ],

  routes: [
    {
      path: '/crons',
      component: 'CronsPage',
      name: 'Crons',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Cron Jobs Manager...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Cron Jobs Manager Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Cron Jobs Manager Stopped.');
  },
};
