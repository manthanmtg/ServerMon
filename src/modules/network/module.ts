import { Module, ModuleContext } from '@/types/module';

export const networkModule: Module = {
  id: 'network-monitor',
  name: 'Network Monitor',
  version: '1.0.0',
  description: 'Real-time monitoring of network interfaces, bandwidth usage, and connections.',
  routes: [
    {
      path: '/network',
      component: 'NetworkPage',
      name: 'Network',
    },
  ],
  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Network monitor module');
  },
  start: (ctx: ModuleContext) => {
    ctx.logger.info('Network monitor module started');
  },
  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Network monitor module stopped');
  },
};
