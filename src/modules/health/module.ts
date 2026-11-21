import { Module, ModuleContext } from '@/types/module';

let healthInterval: ReturnType<typeof setInterval> | undefined;

export const healthModule: Module = {
  id: 'health-monitor',
  name: 'Health Monitor',
  version: '1.0.0',
  description: 'Self-monitoring module for ServerMon core diagnostics.',

  widgets: [
    {
      id: 'system-status',
      name: 'System Status',
      component: 'HealthWidget',
    },
  ],

  init: (ctx: ModuleContext) => {
    ctx.logger.info('Initializing Health Monitor Module...');
  },

  start: (ctx: ModuleContext) => {
    ctx.logger.info('Health Monitor Started.');
    if (healthInterval) return;

    // Simulate periodic health checks emit
    healthInterval = setInterval(() => {
      ctx.events.emit('system:health', {
        status: 'healthy',
        timestamp: Date.now(),
        cpu: Math.random() * 100,
      });
    }, 10000);
  },

  stop: (ctx: ModuleContext) => {
    if (healthInterval) {
      clearInterval(healthInterval);
      healthInterval = undefined;
    }

    ctx.logger.info('Health Monitor Stopped.');
  },
};
