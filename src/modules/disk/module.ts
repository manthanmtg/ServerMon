import { Module, ModuleContext } from '@/types/module';

export const diskModule: Module = {
  id: 'disk-monitor',
  name: 'Disk Monitor',
  version: '1.0.0',
  description: 'Monitor disk usage, I/O performance, and storage health.',

  widgets: [
    {
      id: 'disk-usage-summary',
      name: 'Disk Usage',
      component: 'DiskWidget',
    },
  ],

  routes: [
    {
      path: '/disk',
      component: 'DiskPage',
      name: 'Disk',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Disk Monitor Module...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Disk Monitor Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Disk Monitor Stopped.');
  },
};
