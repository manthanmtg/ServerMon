import { Module, ModuleContext } from '@/types/module';

export const selfServiceModule: Module = {
  id: 'self-service',
  name: 'Self Service',
  version: '1.0.0',
  description:
    'Browse and install services, CLI tools, and applications with fully managed provisioning — including port configuration, Nginx reverse proxy, SSL certificates, and systemd services.',

  widgets: [
    {
      id: 'self-service-overview',
      name: 'Self Service',
      component: 'SelfServiceWidget',
    },
  ],

  routes: [
    {
      path: '/self-service',
      component: 'SelfServicePage',
      name: 'Self Service',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Self Service module...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Self Service module started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Self Service module stopped.');
  },
};
