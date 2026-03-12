import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import connectDB from '@/lib/db';
import ServiceAlert from '@/models/ServiceAlert';
import { createLogger } from '@/lib/logger';
import type {
    ServiceUnit,
    ServiceState,
    ServiceSubState,
    ServiceType,
    ServiceLogEntry,
    ServiceAlertSummary,
    ServiceTimerInfo,
    ServiceResourceHistory,
    ServicesSnapshot,
} from '@/modules/services/types';

const execFileAsync = promisify(execFile);
const log = createLogger('services');

const HISTORY_MAX = 60;
const resourceHistory: ServiceResourceHistory[] = [];

let systemdChecked = false;
let systemdAvailable = false;

async function checkSystemd(): Promise<boolean> {
    if (systemdChecked) return systemdAvailable;
    try {
        await execFileAsync('systemctl', ['--version'], { timeout: 5000 });
        systemdAvailable = true;
    } catch {
        systemdAvailable = false;
        log.warn('systemd not available, using mock data');
    }
    systemdChecked = true;
    return systemdAvailable;
}

async function execCmd(cmd: string, args: string[], timeoutMs = 10000): Promise<string> {
    try {
        const { stdout } = await execFileAsync(cmd, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
        return stdout;
    } catch (err: unknown) {
        const error = err as { stdout?: string; stderr?: string };
        if (error.stdout) return error.stdout;
        throw err;
    }
}

function parseServiceState(val: string): ServiceState {
    const states: ServiceState[] = ['active', 'inactive', 'failed', 'activating', 'deactivating', 'reloading'];
    return states.includes(val as ServiceState) ? (val as ServiceState) : 'unknown';
}

function parseSubState(val: string): ServiceSubState {
    const states: ServiceSubState[] = ['running', 'exited', 'dead', 'waiting', 'start-pre', 'start', 'stop', 'stop-post', 'failed', 'auto-restart', 'listening', 'mounted', 'plugged'];
    return states.includes(val as ServiceSubState) ? (val as ServiceSubState) : 'unknown';
}

function parseServiceType(val: string): ServiceType {
    const types: ServiceType[] = ['simple', 'forking', 'oneshot', 'dbus', 'notify', 'idle'];
    return types.includes(val as ServiceType) ? (val as ServiceType) : 'unknown';
}

async function listServices(): Promise<ServiceUnit[]> {
    const raw = await execCmd('systemctl', [
        'list-units', '--type=service', '--all', '--no-pager', '--no-legend',
        '--plain', '--full',
    ]);

    const serviceNames: string[] = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        const name = parts[0];
        if (name && name.endsWith('.service')) {
            serviceNames.push(name);
        }
    }

    const batchSize = 50;
    const allUnits: ServiceUnit[] = [];

    for (let i = 0; i < serviceNames.length; i += batchSize) {
        const batch = serviceNames.slice(i, i + batchSize);
        const props = [
            'Id', 'Description', 'LoadState', 'ActiveState', 'SubState', 'Type',
            'MainPID', 'MemoryCurrent', 'CPUUsageNSec', 'NRestarts',
            'UnitFileState', 'FragmentPath', 'ActiveEnterTimestamp',
            'Wants', 'Requires', 'After', 'TriggeredBy',
        ];
        const showArgs = batch.flatMap((name) => ['--property=' + props.join(','), name]);
        const showRaw = await execCmd('systemctl', ['show', ...showArgs]);

        const blocks = showRaw.split('\n\n').filter(Boolean);
        for (const block of blocks) {
            const kv: Record<string, string> = {};
            for (const line of block.split('\n')) {
                const eqIdx = line.indexOf('=');
                if (eqIdx > 0) {
                    kv[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
                }
            }
            if (!kv.Id) continue;

            const activeState = parseServiceState(kv.ActiveState || '');
            const activeEnter = kv.ActiveEnterTimestamp ? new Date(kv.ActiveEnterTimestamp).getTime() : 0;
            const uptimeSeconds = activeState === 'active' && activeEnter > 0
                ? Math.floor((Date.now() - activeEnter) / 1000)
                : 0;

            const cpuNs = Number(kv.CPUUsageNSec) || 0;
            const memBytes = Number(kv.MemoryCurrent) || 0;

            const splitList = (val: string | undefined) =>
                val ? val.split(/\s+/).filter(Boolean) : undefined;

            allUnits.push({
                name: kv.Id.replace(/\.service$/, ''),
                description: kv.Description || '',
                loadState: kv.LoadState || 'unknown',
                activeState,
                subState: parseSubState(kv.SubState || ''),
                type: parseServiceType(kv.Type || ''),
                mainPid: Number(kv.MainPID) || 0,
                cpuPercent: cpuNs > 0 ? Math.min(100, cpuNs / 1e9 / 10) : 0,
                memoryBytes: memBytes === 18446744073709551615 ? 0 : memBytes,
                memoryPercent: 0,
                uptimeSeconds,
                restartCount: Number(kv.NRestarts) || 0,
                enabled: kv.UnitFileState === 'enabled' || kv.UnitFileState === 'enabled-runtime',
                unitFileState: kv.UnitFileState || 'unknown',
                fragmentPath: kv.FragmentPath || '',
                triggeredBy: kv.TriggeredBy || undefined,
                wants: splitList(kv.Wants),
                requires: splitList(kv.Requires),
                after: splitList(kv.After),
            });
        }
    }

    let totalMemory = 0;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const si = require('systeminformation');
        const mem = await si.mem();
        totalMemory = mem.total;
    } catch {
        totalMemory = 0;
    }

    if (totalMemory > 0) {
        for (const unit of allUnits) {
            unit.memoryPercent = unit.memoryBytes > 0
                ? Math.round((unit.memoryBytes / totalMemory) * 10000) / 100
                : 0;
        }
    }

    return allUnits;
}

async function listTimers(): Promise<ServiceTimerInfo[]> {
    try {
        const raw = await execCmd('systemctl', [
            'list-timers', '--all', '--no-pager', '--no-legend', '--plain',
        ]);
        const timers: ServiceTimerInfo[] = [];
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s{2,}/);
            if (parts.length >= 4) {
                timers.push({
                    nextRun: parts[0] || '',
                    lastRun: parts[2] || '',
                    name: parts[3] || '',
                    activates: parts[3]?.replace(/\.timer$/, '.service') || '',
                    persistent: false,
                });
            }
        }
        return timers;
    } catch {
        return [];
    }
}

async function getServiceLogs(serviceName: string, lines = 100): Promise<ServiceLogEntry[]> {
    const hasSystemd = await checkSystemd();
    if (!hasSystemd) return generateMockLogs(serviceName, lines);

    try {
        const raw = await execCmd('journalctl', [
            '-u', `${serviceName}.service`,
            '-n', String(Math.min(lines, 500)),
            '--no-pager',
            '-o', 'json',
        ]);
        const entries: ServiceLogEntry[] = [];
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            try {
                const parsed = JSON.parse(line);
                entries.push({
                    timestamp: parsed.__REALTIME_TIMESTAMP
                        ? new Date(Number(parsed.__REALTIME_TIMESTAMP) / 1000).toISOString()
                        : new Date().toISOString(),
                    priority: mapJournalPriority(Number(parsed.PRIORITY) || 6),
                    message: parsed.MESSAGE || '',
                    unit: serviceName,
                });
            } catch {
                // skip malformed json lines
            }
        }
        return entries;
    } catch {
        return [];
    }
}

function mapJournalPriority(p: number): ServiceLogEntry['priority'] {
    const map: Record<number, ServiceLogEntry['priority']> = {
        0: 'emerg', 1: 'alert', 2: 'crit', 3: 'err',
        4: 'warning', 5: 'notice', 6: 'info', 7: 'debug',
    };
    return map[p] || 'info';
}

async function performAction(
    serviceName: string,
    action: 'start' | 'stop' | 'restart' | 'enable' | 'disable' | 'reload'
): Promise<{ success: boolean; message: string }> {
    const hasSystemd = await checkSystemd();
    if (!hasSystemd) {
        return { success: true, message: `[mock] ${action} ${serviceName} completed` };
    }

    try {
        await execCmd('systemctl', [action, `${serviceName}.service`], 30000);
        return { success: true, message: `${action} ${serviceName} completed` };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, message };
    }
}

function computeHealthScore(services: ServiceUnit[]): number {
    if (services.length === 0) return 100;
    const loaded = services.filter((s) => s.loadState === 'loaded');
    if (loaded.length === 0) return 100;
    const failed = loaded.filter((s) => s.activeState === 'failed').length;
    const inactive = loaded.filter((s) => s.activeState === 'inactive' && s.enabled).length;
    const penalty = (failed * 10) + (inactive * 3);
    return Math.max(0, Math.round(100 - (penalty / loaded.length) * 100));
}

async function evaluateAlerts(services: ServiceUnit[]): Promise<ServiceAlertSummary[]> {
    try {
        await connectDB();
    } catch {
        return [];
    }

    const now = new Date();
    const activeFingerprints = new Set<string>();

    for (const svc of services) {
        if (svc.activeState === 'failed') {
            const fp = `svc-failed:${svc.name}`;
            activeFingerprints.add(fp);
            await ServiceAlert.findOneAndUpdate(
                { fingerprint: fp },
                {
                    $set: {
                        severity: 'critical',
                        title: `${svc.name} is in failed state`,
                        message: `Service ${svc.name} has entered the failed state (sub-state: ${svc.subState}).`,
                        service: svc.name,
                        active: true,
                        lastSeenAt: now,
                    },
                    $setOnInsert: { firstSeenAt: now },
                },
                { upsert: true }
            );
        }

        if (svc.restartCount > 3) {
            const fp = `svc-restart-loop:${svc.name}`;
            activeFingerprints.add(fp);
            await ServiceAlert.findOneAndUpdate(
                { fingerprint: fp },
                {
                    $set: {
                        severity: 'warning',
                        title: `${svc.name} restart loop detected`,
                        message: `Service ${svc.name} has restarted ${svc.restartCount} times.`,
                        service: svc.name,
                        active: true,
                        lastSeenAt: now,
                    },
                    $setOnInsert: { firstSeenAt: now },
                },
                { upsert: true }
            );
        }

        if (svc.cpuPercent > 80) {
            const fp = `svc-cpu-critical:${svc.name}`;
            activeFingerprints.add(fp);
            await ServiceAlert.findOneAndUpdate(
                { fingerprint: fp },
                {
                    $set: {
                        severity: 'critical',
                        title: `${svc.name} high CPU usage`,
                        message: `Service ${svc.name} is using ${svc.cpuPercent.toFixed(1)}% CPU.`,
                        service: svc.name,
                        active: true,
                        lastSeenAt: now,
                    },
                    $setOnInsert: { firstSeenAt: now },
                },
                { upsert: true }
            );
        } else if (svc.cpuPercent > 50) {
            const fp = `svc-cpu-warning:${svc.name}`;
            activeFingerprints.add(fp);
            await ServiceAlert.findOneAndUpdate(
                { fingerprint: fp },
                {
                    $set: {
                        severity: 'warning',
                        title: `${svc.name} elevated CPU usage`,
                        message: `Service ${svc.name} is using ${svc.cpuPercent.toFixed(1)}% CPU.`,
                        service: svc.name,
                        active: true,
                        lastSeenAt: now,
                    },
                    $setOnInsert: { firstSeenAt: now },
                },
                { upsert: true }
            );
        }

        if (svc.memoryBytes > 4 * 1024 * 1024 * 1024) {
            const fp = `svc-mem-critical:${svc.name}`;
            activeFingerprints.add(fp);
            await ServiceAlert.findOneAndUpdate(
                { fingerprint: fp },
                {
                    $set: {
                        severity: 'critical',
                        title: `${svc.name} high memory usage`,
                        message: `Service ${svc.name} is using ${(svc.memoryBytes / (1024 * 1024 * 1024)).toFixed(1)} GiB.`,
                        service: svc.name,
                        active: true,
                        lastSeenAt: now,
                    },
                    $setOnInsert: { firstSeenAt: now },
                },
                { upsert: true }
            );
        } else if (svc.memoryBytes > 2 * 1024 * 1024 * 1024) {
            const fp = `svc-mem-warning:${svc.name}`;
            activeFingerprints.add(fp);
            await ServiceAlert.findOneAndUpdate(
                { fingerprint: fp },
                {
                    $set: {
                        severity: 'warning',
                        title: `${svc.name} elevated memory usage`,
                        message: `Service ${svc.name} is using ${(svc.memoryBytes / (1024 * 1024 * 1024)).toFixed(1)} GiB.`,
                        service: svc.name,
                        active: true,
                        lastSeenAt: now,
                    },
                    $setOnInsert: { firstSeenAt: now },
                },
                { upsert: true }
            );
        }
    }

    await ServiceAlert.updateMany(
        {
            active: true,
            fingerprint: { $nin: [...activeFingerprints] },
        },
        { $set: { active: false, resolvedAt: now } }
    );

    const alerts = await ServiceAlert.find({ active: true })
        .sort({ severity: 1, lastSeenAt: -1 })
        .limit(50)
        .lean();

    return alerts.map((a) => ({
        id: String(a._id),
        severity: a.severity,
        title: a.title,
        message: a.message,
        service: a.service,
        active: a.active,
        firstSeenAt: a.firstSeenAt.toISOString(),
        lastSeenAt: a.lastSeenAt.toISOString(),
    }));
}

function recordHistory(services: ServiceUnit[]): void {
    const top = [...services]
        .sort((a, b) => (b.cpuPercent + b.memoryBytes) - (a.cpuPercent + a.memoryBytes))
        .slice(0, 10);

    resourceHistory.push({
        timestamp: new Date().toISOString(),
        services: top.map((s) => ({
            name: s.name,
            cpuPercent: s.cpuPercent,
            memoryBytes: s.memoryBytes,
        })),
    });

    while (resourceHistory.length > HISTORY_MAX) {
        resourceHistory.shift();
    }
}

// ─── Mock data for non-systemd systems ───────────────────────────────

function generateMockServices(): ServiceUnit[] {
    const mockServices: Array<{
        name: string;
        desc: string;
        state: ServiceState;
        sub: ServiceSubState;
        cpu: number;
        mem: number;
        pid: number;
        uptime: number;
        restarts: number;
        enabled: boolean;
        type: ServiceType;
    }> = [
        { name: 'nginx', desc: 'A high performance web server', state: 'active', sub: 'running', cpu: 2.3, mem: 85 * 1024 * 1024, pid: 1234, uptime: 864000, restarts: 0, enabled: true, type: 'forking' },
        { name: 'postgresql', desc: 'PostgreSQL RDBMS', state: 'active', sub: 'running', cpu: 8.1, mem: 512 * 1024 * 1024, pid: 2345, uptime: 604800, restarts: 1, enabled: true, type: 'notify' },
        { name: 'redis-server', desc: 'Advanced key-value store', state: 'active', sub: 'running', cpu: 1.5, mem: 128 * 1024 * 1024, pid: 3456, uptime: 432000, restarts: 0, enabled: true, type: 'notify' },
        { name: 'docker', desc: 'Docker Application Container Engine', state: 'active', sub: 'running', cpu: 5.2, mem: 256 * 1024 * 1024, pid: 4567, uptime: 172800, restarts: 2, enabled: true, type: 'notify' },
        { name: 'sshd', desc: 'OpenBSD Secure Shell server', state: 'active', sub: 'running', cpu: 0.1, mem: 12 * 1024 * 1024, pid: 5678, uptime: 1728000, restarts: 0, enabled: true, type: 'notify' },
        { name: 'cron', desc: 'Regular background program processing daemon', state: 'active', sub: 'running', cpu: 0.0, mem: 4 * 1024 * 1024, pid: 6789, uptime: 1728000, restarts: 0, enabled: true, type: 'simple' },
        { name: 'mongod', desc: 'MongoDB Database Server', state: 'active', sub: 'running', cpu: 12.4, mem: 1024 * 1024 * 1024, pid: 7890, uptime: 86400, restarts: 0, enabled: true, type: 'forking' },
        { name: 'mysql', desc: 'MySQL Community Server', state: 'inactive', sub: 'dead', cpu: 0, mem: 0, pid: 0, uptime: 0, restarts: 0, enabled: false, type: 'notify' },
        { name: 'apache2', desc: 'Apache HTTP Server', state: 'failed', sub: 'failed', cpu: 0, mem: 0, pid: 0, uptime: 0, restarts: 5, enabled: true, type: 'forking' },
        { name: 'prometheus', desc: 'Monitoring system and time series database', state: 'active', sub: 'running', cpu: 3.8, mem: 350 * 1024 * 1024, pid: 9012, uptime: 259200, restarts: 0, enabled: true, type: 'simple' },
        { name: 'grafana-server', desc: 'Grafana analytics and monitoring', state: 'active', sub: 'running', cpu: 1.2, mem: 180 * 1024 * 1024, pid: 1123, uptime: 259200, restarts: 0, enabled: true, type: 'simple' },
        { name: 'node-exporter', desc: 'Prometheus exporter for machine metrics', state: 'active', sub: 'running', cpu: 0.4, mem: 24 * 1024 * 1024, pid: 2234, uptime: 604800, restarts: 0, enabled: true, type: 'simple' },
        { name: 'fail2ban', desc: 'Fail2Ban Service', state: 'active', sub: 'running', cpu: 0.1, mem: 32 * 1024 * 1024, pid: 3345, uptime: 1728000, restarts: 0, enabled: true, type: 'simple' },
        { name: 'ufw', desc: 'Uncomplicated Firewall', state: 'active', sub: 'exited', cpu: 0, mem: 0, pid: 0, uptime: 1728000, restarts: 0, enabled: true, type: 'oneshot' },
        { name: 'systemd-timesyncd', desc: 'Network Time Synchronization', state: 'active', sub: 'running', cpu: 0.0, mem: 6 * 1024 * 1024, pid: 4456, uptime: 1728000, restarts: 0, enabled: true, type: 'notify' },
        { name: 'elasticsearch', desc: 'Elasticsearch', state: 'activating', sub: 'start', cpu: 45.0, mem: 2048 * 1024 * 1024, pid: 5567, uptime: 0, restarts: 3, enabled: true, type: 'notify' },
        { name: 'logstash', desc: 'Logstash', state: 'inactive', sub: 'dead', cpu: 0, mem: 0, pid: 0, uptime: 0, restarts: 0, enabled: false, type: 'simple' },
        { name: 'kibana', desc: 'Kibana', state: 'active', sub: 'running', cpu: 2.1, mem: 420 * 1024 * 1024, pid: 6678, uptime: 86400, restarts: 0, enabled: true, type: 'simple' },
    ];

    const jitter = () => (Math.random() - 0.5) * 0.4;

    return mockServices.map((s) => ({
        name: s.name,
        description: s.desc,
        loadState: 'loaded',
        activeState: s.state,
        subState: s.sub,
        type: s.type,
        mainPid: s.pid,
        cpuPercent: Math.max(0, s.cpu + s.cpu * jitter()),
        memoryBytes: Math.max(0, Math.round(s.mem * (1 + jitter() * 0.1))),
        memoryPercent: s.mem > 0 ? Math.round((s.mem / (16 * 1024 * 1024 * 1024)) * 10000) / 100 : 0,
        uptimeSeconds: s.uptime,
        restartCount: s.restarts,
        enabled: s.enabled,
        unitFileState: s.enabled ? 'enabled' : 'disabled',
        fragmentPath: `/lib/systemd/system/${s.name}.service`,
        triggeredBy: undefined,
        wants: undefined,
        requires: undefined,
        after: ['network.target', 'local-fs.target'],
    }));
}

function generateMockTimers(): ServiceTimerInfo[] {
    return [
        { name: 'apt-daily.timer', nextRun: new Date(Date.now() + 3600000).toISOString(), lastRun: new Date(Date.now() - 82800000).toISOString(), activates: 'apt-daily.service', persistent: true },
        { name: 'logrotate.timer', nextRun: new Date(Date.now() + 7200000).toISOString(), lastRun: new Date(Date.now() - 79200000).toISOString(), activates: 'logrotate.service', persistent: false },
        { name: 'fstrim.timer', nextRun: new Date(Date.now() + 518400000).toISOString(), lastRun: new Date(Date.now() - 86400000).toISOString(), activates: 'fstrim.service', persistent: false },
        { name: 'certbot.timer', nextRun: new Date(Date.now() + 43200000).toISOString(), lastRun: new Date(Date.now() - 43200000).toISOString(), activates: 'certbot.service', persistent: true },
    ];
}

function generateMockLogs(serviceName: string, count: number): ServiceLogEntry[] {
    const messages = [
        'Service started successfully',
        'Listening on port configured in /etc/config',
        'Connection from 10.0.0.1 accepted',
        'Health check passed',
        'Worker process spawned',
        'Configuration reloaded',
        'Received SIGHUP, reloading config',
        'Client disconnected gracefully',
        'Memory usage within normal range',
        'Scheduled cleanup completed',
        'TLS certificate verified',
        'Request processed in 12ms',
        'Cache hit ratio: 94.2%',
        'Background job completed',
        'Database connection pool: 8/20 active',
    ];
    const priorities: ServiceLogEntry['priority'][] = ['info', 'info', 'info', 'info', 'notice', 'warning', 'debug'];
    const entries: ServiceLogEntry[] = [];
    for (let i = 0; i < count; i++) {
        entries.push({
            timestamp: new Date(Date.now() - i * 30000).toISOString(),
            priority: priorities[Math.floor(Math.random() * priorities.length)],
            message: messages[Math.floor(Math.random() * messages.length)],
            unit: serviceName,
        });
    }
    return entries;
}

// ─── Public service API ──────────────────────────────────────────────

async function getSnapshot(): Promise<ServicesSnapshot> {
    const hasSystemd = await checkSystemd();

    let services: ServiceUnit[];
    let timers: ServiceTimerInfo[];
    let alerts: ServiceAlertSummary[];

    if (hasSystemd) {
        services = await listServices();
        timers = await listTimers();
    } else {
        services = generateMockServices();
        timers = generateMockTimers();
    }

    recordHistory(services);

    try {
        alerts = await evaluateAlerts(services);
    } catch (err) {
        log.warn('Alert evaluation failed', err);
        alerts = [];
    }

    const loaded = services.filter((s) => s.loadState === 'loaded');
    const running = loaded.filter((s) => s.subState === 'running').length;
    const exited = loaded.filter((s) => s.subState === 'exited').length;
    const failed = loaded.filter((s) => s.activeState === 'failed').length;
    const inactive = loaded.filter((s) => s.activeState === 'inactive').length;
    const enabled = loaded.filter((s) => s.enabled).length;
    const disabled = loaded.filter((s) => !s.enabled).length;

    return {
        source: hasSystemd ? 'systemd' : 'mock',
        systemdAvailable: hasSystemd,
        summary: {
            total: loaded.length,
            running,
            exited,
            failed,
            inactive,
            enabled,
            disabled,
            healthScore: computeHealthScore(services),
        },
        services: loaded,
        timers,
        alerts,
        history: [...resourceHistory],
        timestamp: new Date().toISOString(),
    };
}

export const servicesService = {
    getSnapshot,
    getServiceLogs,
    performAction,
};
