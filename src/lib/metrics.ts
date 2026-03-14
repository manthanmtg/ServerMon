import si from 'systeminformation';
import { EventEmitter } from 'events';
import { createLogger } from './logger';

const log = createLogger('metrics');

export interface SystemMetric {
    timestamp: string;
    serverTimestamp: string;
    cpu: number;
    memory: number;
    cpuCores: number;
    memTotal: number;
    memUsed: number;
    uptime: number;
    swapTotal: number;
    swapUsed: number;
    swapFree: number;
    disks: {
        fs: string;
        type: string;
        size: number;
        used: number;
        available: number;
        use: number;
        mount: string;
    }[];
    io: {
        r_sec: number;
        w_sec: number;
        t_sec: number;
        r_wait: number;
        w_wait: number;
    } | null;
}

const MAX_HISTORY = 120;
const POLL_INTERVAL_MS = 2000;
const MAX_SSE_CONNECTIONS = 20;

class MetricsService extends EventEmitter {
    private static instance: MetricsService;
    private history: SystemMetric[] = [];
    private latest: SystemMetric | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private activeConnections = 0;
    private cpuCores = 0;
    private memTotal = 0;

    private constructor() {
        super();
        this.initStaticInfo().then(() => this.startPolling());
    }

    private async initStaticInfo() {
        try {
            const [cpu, mem] = await Promise.all([
                si.cpu(),
                si.mem(),
            ]);
            this.cpuCores = cpu.cores;
            this.memTotal = mem.total;
        } catch (err) {
            log.error('Failed to get static system info', err);
        }
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
                const [cpu, mem, time, disks, fsStats] = await Promise.all([
                    si.currentLoad(),
                    si.mem(),
                    si.time(),
                    si.fsSize(),
                    si.fsStats(),
                ]);

                const metric: SystemMetric = {
                    timestamp: new Date().toLocaleTimeString(),
                    serverTimestamp: new Date().toISOString(),
                    cpu: cpu.currentLoad,
                    memory: (mem.active / mem.total) * 100,
                    cpuCores: this.cpuCores,
                    memTotal: this.memTotal,
                    memUsed: mem.active,
                    swapTotal: mem.swaptotal,
                    swapUsed: mem.swapused,
                    swapFree: mem.swapfree,
                    uptime: time.uptime,
                    disks: disks.map(d => ({
                        fs: d.fs,
                        type: d.type,
                        size: d.size,
                        used: d.used,
                        available: d.available,
                        use: d.use,
                        mount: d.mount,
                    })),
                    io: fsStats ? {
                        r_sec: fsStats.rx_sec || 0,
                        w_sec: fsStats.wx_sec || 0,
                        t_sec: (fsStats.rx_sec || 0) + (fsStats.wx_sec || 0),
                        r_wait: 0, // systeminformation doesn't provide wait per device in fsStats easily
                        w_wait: 0,
                    } : null,
                };

                this.latest = metric;
                this.history.push(metric);
                if (this.history.length > MAX_HISTORY) {
                    this.history = this.history.slice(-MAX_HISTORY);
                }
                this.emit('metric', metric);
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
