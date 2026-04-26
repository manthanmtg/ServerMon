import { Module, ModuleContext } from '@/types/module';

export const envVarsModule: Module = {
  id: 'env-vars',
  name: 'EnvVars',
  version: '1.0.0',
  description: 'Manage host environment variables across user and system scopes.',

  widgets: [
    {
      id: 'env-vars-overview',
      name: 'EnvVars Overview',
      component: 'EnvVarsWidget',
    },
  ],

  routes: [
    {
      path: '/env-vars',
      component: 'EnvVarsPage',
      name: 'EnvVars',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing EnvVars...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('EnvVars Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('EnvVars Stopped.');
  },
};
