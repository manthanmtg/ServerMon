import { Module, ModuleContext } from '@/types/module';

export const terminalModule: Module = {
  id: 'terminal',
  name: 'Terminal',
  version: '1.0.0',
  description: 'Real-time SSH-based terminal for server administration.',

  routes: [
    {
      path: '/terminal',
      component: 'TerminalPage',
      name: 'Terminal',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Terminal Module...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Terminal Service Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Terminal Service Stopped.');
  },
};
