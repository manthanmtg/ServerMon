import { Module, ModuleContext } from '@/types/module';

export const securityModule: Module = {
  id: 'security-audit',
  name: 'Security Audit',
  version: '1.0.0',
  description:
    'Security posture dashboard, firewall, Fail2Ban, SSH audit, and vulnerability scanning.',

  widgets: [
    {
      id: 'security-overview',
      name: 'Security Overview',
      component: 'SecurityWidget',
    },
  ],

  routes: [
    {
      path: '/security',
      component: 'SecurityPage',
      name: 'Security',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Security Audit...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Security Audit Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Security Audit Stopped.');
  },
};
