import { Module, ModuleContext } from '@/types/module';

export const dockerModule: Module = {
  id: 'docker-monitor',
  name: 'Docker Monitor',
  version: '1.0.0',
  description: 'Real-time Docker daemon, container, image, volume, and network monitoring.',
  routes: [
    {
      path: '/docker',
      component: 'DockerPage',
      name: 'Docker',
    },
  ],
  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Docker monitor module');
  },
  start: (ctx: ModuleContext) => {
    ctx.logger.info('Docker monitor module started');
  },
  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Docker monitor module stopped');
  },
};
