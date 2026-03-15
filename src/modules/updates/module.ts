import { Module, ModuleContext } from '@/types/module';

export const updatesModule: Module = {
  id: 'updates-monitor',
  name: 'Updates Monitor',
  version: '1.0.0',
  description:
    'Monitors available system and package updates, restart requirements, and update history.',
  routes: [
    {
      path: '/updates',
      component: 'UpdatePage',
      name: 'Updates',
    },
  ],
  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Updates monitor module');
  },
  start: (ctx: ModuleContext) => {
    ctx.logger.info('Updates monitor module started');
  },
  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Updates monitor module stopped');
  },
};
