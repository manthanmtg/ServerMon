import { Module, ModuleContext } from '@/types/module';

export const certificatesModule: Module = {
  id: 'certificates',
  name: 'Certificates',
  version: '1.0.0',
  description: 'SSL/TLS certificate monitoring, expiry alerts, and renewal management.',

  widgets: [
    {
      id: 'certificates-overview',
      name: 'Certificates Overview',
      component: 'CertificatesWidget',
    },
  ],

  routes: [
    {
      path: '/certificates',
      component: 'CertificatesPage',
      name: 'Certificates',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Certificates...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Certificates Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Certificates Stopped.');
  },
};
