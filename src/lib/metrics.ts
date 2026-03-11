import si from 'systeminformation';
import { createLogger } from './logger';

const log = createLogger('metrics');

export interface SystemMetric {
    timestamp: string;
    cpu: number;
    memory: number;
}

const MAX_HISTORY = 120;
const POLL_INTERVAL_MS = 2000;
const MAX_SSE_CONNECTIONS = 20;

class MetricsService {
    private static instance: MetricsService;
    private history: SystemMetric[] = [];
    private latest: SystemMetric | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private activeConnections = 0;

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
        const poll = async () => {
            try {
                const [cpu, mem] = await Promise.all([
                    si.currentLoad(),
                    si.mem(),
                ]);

                const metric: SystemMetric = {
                    timestamp: new Date().toLocaleTimeString(),
                    cpu: cpu.currentLoad,
                    memory: (mem.active / mem.total) * 100,
                };

                this.latest = metric;
                this.history.push(metric);
                if (this.history.length > MAX_HISTORY) {
                    this.history = this.history.slice(-MAX_HISTORY);
                }
            } catch (err) {
                log.error('Failed to poll system metrics', err);
            }
        };

        poll();
        this.pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    }

    public getCurrent(): SystemMetric | null {
        return this.latest;
    }

    public getHistory(): SystemMetric[] {
        return [...this.history];
    }

    public canAcceptConnection(): boolean {
        return this.activeConnections < MAX_SSE_CONNECTIONS;
    }

    public registerConnection(): void {
        this.activeConnections++;
        log.debug(`SSE connection opened (active: ${this.activeConnections})`);
    }

    public unregisterConnection(): void {
        this.activeConnections = Math.max(0, this.activeConnections - 1);
        log.debug(`SSE connection closed (active: ${this.activeConnections})`);
    }

    public getConnectionCount(): number {
        return this.activeConnections;
    }

    public shutdown(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        log.info('Metrics service shut down');
    }
}

export const metricsService = MetricsService.getInstance();
