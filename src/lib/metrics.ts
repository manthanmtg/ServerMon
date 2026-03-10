import si from 'systeminformation';

export interface SystemMetric {
    timestamp: string;
    cpu: number;
    memory: number;
}

class MetricsService {
    private static instance: MetricsService;
    private history: SystemMetric[] = [];
    private maxHistory = 60; // Keep 60 seconds of data

    private constructor() {
        this.startPolling();
    }

    public static getInstance(): MetricsService {
        if (!MetricsService.instance) {
            MetricsService.instance = new MetricsService();
        }
        return MetricsService.instance;
    }

    private startPolling() {
        setInterval(async () => {
            try {
                const cpu = await si.currentLoad();
                const mem = await si.mem();

                const metric: SystemMetric = {
                    timestamp: new Date().toLocaleTimeString(),
                    cpu: cpu.currentLoad,
                    memory: (mem.active / mem.total) * 100
                };

                this.history.push(metric);
                if (this.history.length > this.maxHistory) {
                    this.history.shift();
                }
            } catch (err) {
                console.error('[MetricsService] Error polling metrics:', err);
            }
        }, 1000); // Pulse every second
    }

    public getHistory(): SystemMetric[] {
        return this.history;
    }

    public async getCurrent(): Promise<SystemMetric> {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        return {
            timestamp: new Date().toLocaleTimeString(),
            cpu: cpu.currentLoad,
            memory: (mem.active / mem.total) * 100
        };
    }
}

export const metricsService = MetricsService.getInstance();
