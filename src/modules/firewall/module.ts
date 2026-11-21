import { Module, ModuleContext } from '@/types/module';

export const firewallModule: Module = {
  id: 'firewall',
  name: 'Firewall',
  version: '1.0.0',
  description: 'Monitor host firewall posture, default policies, rule exposure, and risks.',

  widgets: [
    {
      id: 'firewall-overview',
      name: 'Firewall Overview',
      component: 'FirewallWidget',
    },
  ],

  routes: [
    {
      path: '/firewall',
      component: 'FirewallPage',
      name: 'Firewall',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Firewall...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Firewall Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Firewall Stopped.');
  },
};
