import { Module, ModuleContext } from '@/types/module';

export const aiRunnerModule: Module = {
  id: 'ai-runner',
  name: 'AI Runner',
  version: '1.0.0',
  description: 'Run, schedule, and audit AI agent prompts across repositories.',

  widgets: [
    {
      id: 'ai-runner-overview',
      name: 'AI Runner Overview',
      component: 'AIRunnerWidget',
    },
  ],

  routes: [
    {
      path: '/ai-runner',
      component: 'AIRunnerPage',
      name: 'AI Runner',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing AI Runner Module...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('AI Runner Module Started.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('AI Runner Module Stopped.');
  },
};
