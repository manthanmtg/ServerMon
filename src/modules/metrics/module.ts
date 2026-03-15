import { Module, ModuleContext } from '@/types/module';

export const metricsModule: Module = {
  id: 'system-metrics',
  name: 'Real-time Metrics',
  version: '1.0.0',
  description: 'High-fidelity system resource visualization.',

  widgets: [
    {
      id: 'cpu-history',
      name: 'CPU Status',
      component: 'CPUChartWidget',
    },
    {
      id: 'mem-history',
      name: 'Memory Status',
      component: 'MemoryChartWidget',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Metrics Engine UI...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Metrics Stream Active.');
  },

  stop: (ctx: ModuleContext) => {
    ctx.logger.info('Metrics Stream Suspended.');
  },
};
