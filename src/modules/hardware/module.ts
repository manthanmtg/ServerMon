import { Module, ModuleContext } from '@/types/module';

export const hardwareModule: Module = {
  id: 'hardware-info',
  name: 'Hardware Info',
  version: '1.0.0',
  description: 'Comprehensive hardware inventory, sensors, and system specifications.',

  widgets: [
    {
      id: 'hardware-overview',
      name: 'Hardware Overview',
      component: 'HardwareWidget',
    },
  ],

  routes: [
    {
      path: '/hardware',
      component: 'HardwarePage',
      name: 'Hardware',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Hardware Info...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Hardware Info Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Hardware Info Stopped.');
  },
};
