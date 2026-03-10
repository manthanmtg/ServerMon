import { Module, ModuleContext } from '@/types/module';
import si from 'systeminformation';

export const processModule: Module = {
    id: 'process-monitor',
    name: 'Process Monitor',
    version: '1.0.0',
    description: 'Monitor and manage system processes.',

    widgets: [
        {
            id: 'top-processes',
            name: 'Top Processes',
            component: 'ProcessWidget'
        }
    ],

    routes: [
        {
            path: '/api/modules/processes',
            component: 'ProcessAPI',
            name: 'Process API'
        }
    ],

    init: (ctx: ModuleContext) => {
        ctx.logger.info('Initializing Process Monitor...');
    },

    start: (ctx: ModuleContext) => {
        ctx.logger.info('Process Monitor Started.');

        // Periodically emit heavy processes to EventBus
        setInterval(async () => {
            try {
                const procs = await si.processes();
                const topProcs = procs.list
                    .sort((a, b) => b.cpu - a.cpu)
                    .slice(0, 5)
                    .map(p => ({
                        pid: p.pid,
                        name: p.name,
                        cpu: p.cpu,
                        mem: p.mem
                    }));

                ctx.events.emit('processes:update', topProcs);
            } catch (err) {
                ctx.logger.error('Failed to fetch processes', err);
            }
        }, 5000);
    },

    stop: (ctx: ModuleContext) => {
        ctx.logger.info('Process Monitor Stopped.');
    }
};
