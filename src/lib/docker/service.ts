import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import connectDB from '@/lib/db';
import DockerAlert from '@/models/DockerAlert';
import DockerStatAggregate from '@/models/DockerStatAggregate';
import { analyticsService } from '@/lib/analytics';
import type {
    DockerAlertSummary,
    DockerContainerSummary,
    DockerEventEntry,
    DockerImageSummary,
    DockerSnapshot,
} from '@/modules/docker/types';

const execFileAsync = promisify(execFile);
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;


interface MockContainer {
    id: string;
    name: string;
    image: string;
    imageId: string;
    state: 'running' | 'exited' | 'paused' | 'restarting';
    status: string;
    createdAt: string;
    ports: string[];
    networks: string[];
    mounts: { source: string; destination: string; mode: string; rw: boolean }[];
    env: string[];
    restartCount: number;
    cpuPercent: number;
    memoryPercent: number;
    memoryUsageBytes: number;
    memoryLimitBytes: number;
    blockReadBytes: number;
    blockWriteBytes: number;
    networkInBytes: number;
    networkOutBytes: number;
}

function parseJsonLines<T>(input: string): T[] {
    return input
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as T);
}

function parseSize(value: string | number | undefined): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const trimmed = value.trim();
    if (!trimmed || trimmed === '0B' || trimmed === '0 B') return 0;
    const match = trimmed.match(/^([\d.]+)\s*([kmgtp]?i?b)$/i);
    if (!match) return Number(trimmed) || 0;
    const amount = Number(match[1]);
    const unit = match[2].toUpperCase();
    const powers: Record<string, number> = {
        B: 0,
        KB: 1,
        MB: 2,
        GB: 3,
        TB: 4,
        PB: 5,
        KIB: 1,
        MIB: 2,
        GIB: 3,
        TIB: 4,
        PIB: 5,
    };
    const power = powers[unit] ?? 0;
    const base = unit.includes('I') ? 1024 : 1000;
    return Math.round(amount * (base ** power));
}

function parsePercent(value: string | number | undefined): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    return Number(String(value).replace('%', '').trim()) || 0;
}

function summarizePorts(raw: unknown): string[] {
    if (typeof raw === 'string') {
        return raw.split(',').map((port) => port.trim()).filter(Boolean);
    }
    return [];
}

function toIso(value: unknown): string {
    const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function safeName(name: string): string {
    return name.replace(/^\//, '');
}

async function tryConnectDB() {
    if (!process.env.MONGO_URI) {
        return false;
    }
    try {
        await connectDB();
        return true;
    } catch {
        return false;
    }
}

class DockerService {
    private history: DockerSnapshot['history'] = [];
    private recentEvents: DockerEventEntry[] = [];
    private mockContainers: MockContainer[] = [
        {
            id: 'mock-api',
            name: 'servermon-api',
            image: 'ghcr.io/acme/servermon:1.4.2',
            imageId: 'img-api',
            state: 'running',
            status: 'Up 2 hours',
            createdAt: new Date(Date.now() - 8 * 60 * MINUTE_MS).toISOString(),
            ports: ['0.0.0.0:8912->8912/tcp'],
            networks: ['bridge', 'monitoring'],
            mounts: [{ source: '/srv/servermon', destination: '/app/data', mode: 'rw', rw: true }],
            env: ['NODE_ENV=production', 'LOG_LEVEL=info'],
            restartCount: 0,
            cpuPercent: 34,
            memoryPercent: 61,
            memoryUsageBytes: 525 * 1024 * 1024,
            memoryLimitBytes: 1024 * 1024 * 1024,
            blockReadBytes: 140 * 1024 * 1024,
            blockWriteBytes: 92 * 1024 * 1024,
            networkInBytes: 320 * 1024 * 1024,
            networkOutBytes: 268 * 1024 * 1024,
        },
        {
            id: 'mock-worker',
            name: 'job-worker',
            image: 'redis:7.4',
            imageId: 'img-worker',
            state: 'running',
            status: 'Up 55 minutes',
            createdAt: new Date(Date.now() - 55 * MINUTE_MS).toISOString(),
            ports: ['6379/tcp'],
            networks: ['backend'],
            mounts: [{ source: 'redis-data', destination: '/data', mode: 'rw', rw: true }],
            env: ['ALLOW_EMPTY_PASSWORD=no'],
            restartCount: 1,
            cpuPercent: 18,
            memoryPercent: 42,
            memoryUsageBytes: 182 * 1024 * 1024,
            memoryLimitBytes: 768 * 1024 * 1024,
            blockReadBytes: 45 * 1024 * 1024,
            blockWriteBytes: 71 * 1024 * 1024,
            networkInBytes: 128 * 1024 * 1024,
            networkOutBytes: 212 * 1024 * 1024,
        },
        {
            id: 'mock-nginx',
            name: 'edge-proxy',
            image: 'nginx:1.28',
            imageId: 'img-nginx',
            state: 'exited',
            status: 'Exited (137) 4 minutes ago',
            createdAt: new Date(Date.now() - 3 * 60 * MINUTE_MS).toISOString(),
            ports: ['80/tcp', '443/tcp'],
            networks: ['frontend'],
            mounts: [{ source: '/etc/nginx', destination: '/etc/nginx', mode: 'ro', rw: false }],
            env: ['NGINX_ENTRYPOINT_QUIET_LOGS=1'],
            restartCount: 4,
            cpuPercent: 0,
            memoryPercent: 0,
            memoryUsageBytes: 0,
            memoryLimitBytes: 256 * 1024 * 1024,
            blockReadBytes: 12 * 1024 * 1024,
            blockWriteBytes: 6 * 1024 * 1024,
            networkInBytes: 4 * 1024 * 1024,
            networkOutBytes: 1 * 1024 * 1024,
        },
    ];
    private mockImages: DockerImageSummary[] = [
        { id: 'img-api', repository: 'ghcr.io/acme/servermon', tag: '1.4.2', sizeBytes: 742 * 1024 * 1024, createdAt: new Date(Date.now() - DAY_MS).toISOString(), containersUsing: 1 },
        { id: 'img-worker', repository: 'redis', tag: '7.4', sizeBytes: 118 * 1024 * 1024, createdAt: new Date(Date.now() - 2 * DAY_MS).toISOString(), containersUsing: 1 },
        { id: 'img-nginx', repository: 'nginx', tag: '1.28', sizeBytes: 78 * 1024 * 1024, createdAt: new Date(Date.now() - 4 * DAY_MS).toISOString(), containersUsing: 1 },
    ];
    private mockEvents: DockerEventEntry[] = [
        {
            id: 'evt-1',
            time: new Date(Date.now() - 3 * MINUTE_MS).toISOString(),
            action: 'stop',
            type: 'container',
            actor: 'edge-proxy',
            attributes: { exitCode: '137' },
        },
    ];
    private lastMinuteBucket = '';

    private shouldUseMockMode() {
        return process.env.SERVERMON_DOCKER_MOCK === '1' || process.env.NODE_ENV === 'test';
    }

    private async runDocker(args: string[]) {
        const { stdout } = await execFileAsync('docker', args, { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
        return stdout;
    }

    private advanceMockState() {
        this.mockContainers = this.mockContainers.map((container, index) => {
            if (container.state !== 'running') {
                return container;
            }
            const swing = ((Date.now() / 1000) + index * 7) % 10;
            const cpuPercent = Math.max(3, Math.min(96, container.cpuPercent + (swing - 5) * 1.4));
            const memoryPercent = Math.max(8, Math.min(98, container.memoryPercent + (5 - swing) * 0.6));
            const memoryLimitBytes = container.memoryLimitBytes;
            const memoryUsageBytes = Math.round(memoryLimitBytes * (memoryPercent / 100));
            return {
                ...container,
                cpuPercent,
                memoryPercent,
                memoryUsageBytes,
                blockReadBytes: container.blockReadBytes + Math.round((index + 1) * 1.5 * 1024 * 1024),
                blockWriteBytes: container.blockWriteBytes + Math.round((index + 1) * 1.1 * 1024 * 1024),
                networkInBytes: container.networkInBytes + Math.round((index + 1) * 2.2 * 1024 * 1024),
                networkOutBytes: container.networkOutBytes + Math.round((index + 1) * 1.6 * 1024 * 1024),
            };
        });
    }

    private buildMockSnapshot(): DockerSnapshot {
        this.advanceMockState();
        const running = this.mockContainers.filter((container) => container.state === 'running').length;
        const stopped = this.mockContainers.filter((container) => container.state === 'exited').length;
        const paused = this.mockContainers.filter((container) => container.state === 'paused').length;
        const imagesBytes = this.mockImages.reduce((sum, image) => sum + image.sizeBytes, 0);
        const containersBytes = this.mockContainers.reduce((sum, container) => sum + container.blockReadBytes + container.blockWriteBytes, 0);
        const volumesBytes = 320 * 1024 * 1024;
        const buildCacheBytes = 140 * 1024 * 1024;
        const totalBytes = imagesBytes + containersBytes + volumesBytes + buildCacheBytes;
        const diskCap = 3 * 1024 * 1024 * 1024;
        const snapshot: DockerSnapshot = {
            source: 'mock',
            daemonReachable: true,
            daemon: {
                name: 'local-engine',
                serverVersion: '29.3.0',
                apiVersion: '1.54',
                operatingSystem: 'Ubuntu 24.04.1 LTS',
                architecture: 'arm64',
                containersRunning: running,
                containersStopped: stopped,
                containersPaused: paused,
                storageDriver: 'overlay2',
                cgroupVersion: '2',
            },
            diskUsage: {
                imagesBytes,
                containersBytes,
                volumesBytes,
                buildCacheBytes,
                totalBytes,
                usedPercent: (totalBytes / diskCap) * 100,
            },
            containers: this.mockContainers.map((container) => ({ ...container, command: 'mock-entrypoint.sh' })),
            images: this.mockImages,
            volumes: [
                { name: 'redis-data', driver: 'local', mountpoint: '/var/lib/docker/volumes/redis-data/_data', scope: 'local' },
                { name: 'servermon-cache', driver: 'local', mountpoint: '/var/lib/docker/volumes/servermon-cache/_data', scope: 'local' },
            ],
            networks: [
                { id: 'net-frontend', name: 'frontend', driver: 'bridge', scope: 'local' },
                { id: 'net-backend', name: 'backend', driver: 'bridge', scope: 'local' },
                { id: 'net-monitoring', name: 'monitoring', driver: 'bridge', scope: 'local' },
            ],
            events: [...this.mockEvents].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 25),
            alerts: [],
            history: [],
            timestamp: new Date().toISOString(),
        };
        return snapshot;
    }

    private pushHistory(snapshot: DockerSnapshot) {
        this.history.push({
            timestamp: snapshot.timestamp,
            containers: snapshot.containers.map((container) => ({
                id: container.id,
                name: container.name,
                cpuPercent: container.cpuPercent,
                memoryPercent: container.memoryPercent,
                blockReadBytes: container.blockReadBytes,
                blockWriteBytes: container.blockWriteBytes,
                networkInBytes: container.networkInBytes,
                networkOutBytes: container.networkOutBytes,
            })),
        });
        this.history = this.history.slice(-120);
    }

    private async persistHistory(snapshot: DockerSnapshot) {
        const currentBucket = new Date(snapshot.timestamp);
        currentBucket.setSeconds(0, 0);
        const bucketStart = currentBucket.toISOString();
        if (bucketStart === this.lastMinuteBucket) {
            return;
        }
        this.lastMinuteBucket = bucketStart;
        if (!(await tryConnectDB())) {
            return;
        }
        await DockerStatAggregate.findOneAndUpdate(
            { bucketStart: currentBucket },
            {
                bucketStart: currentBucket,
                containers: snapshot.containers.map((container) => ({
                    containerId: container.id,
                    name: container.name,
                    cpuPercent: container.cpuPercent,
                    memoryPercent: container.memoryPercent,
                    memoryUsageBytes: container.memoryUsageBytes,
                    memoryLimitBytes: container.memoryLimitBytes,
                    blockReadBytes: container.blockReadBytes,
                    blockWriteBytes: container.blockWriteBytes,
                    networkInBytes: container.networkInBytes,
                    networkOutBytes: container.networkOutBytes,
                })),
            },
            { upsert: true }
        );
        await DockerStatAggregate.deleteMany({ bucketStart: { $lt: new Date(Date.now() - DAY_MS) } });
    }

    private async persistAlerts(alerts: Omit<DockerAlertSummary, 'id'>[]) {
        if (!(await tryConnectDB())) {
            return alerts.map((alert, index) => ({ ...alert, id: `memory-${index}` }));
        }

        const fingerprints = alerts.map((alert) => `${alert.source}:${alert.title}`);
        await DockerAlert.updateMany(
            { active: true, fingerprint: { $nin: fingerprints } },
            { $set: { active: false, resolvedAt: new Date() } }
        );

        const docs: DockerAlertSummary[] = [];
        for (const alert of alerts) {
            const fingerprint = `${alert.source}:${alert.title}`;
            const doc = await DockerAlert.findOneAndUpdate(
                { fingerprint },
                {
                    $set: {
                        severity: alert.severity,
                        title: alert.title,
                        message: alert.message,
                        source: alert.source,
                        active: true,
                        lastSeenAt: new Date(alert.lastSeenAt),
                        resolvedAt: null,
                    },
                    $setOnInsert: { firstSeenAt: new Date(alert.firstSeenAt), fingerprint },
                },
                { upsert: true, new: true }
            ).lean();
            docs.push({
                id: String(doc?._id ?? fingerprint),
                severity: alert.severity,
                title: alert.title,
                message: alert.message,
                source: alert.source,
                active: true,
                firstSeenAt: toIso(doc?.firstSeenAt ?? alert.firstSeenAt),
                lastSeenAt: toIso(doc?.lastSeenAt ?? alert.lastSeenAt),
            });
            await analyticsService.track({
                moduleId: 'docker-monitor',
                event: 'docker:alert',
                severity: alert.severity === 'critical' ? 'error' : 'warn',
                metadata: {
                    title: alert.title,
                    source: alert.source,
                    message: alert.message,
                },
            });
        }
        return docs;
    }

    private async buildAlerts(snapshot: DockerSnapshot) {
        const now = snapshot.timestamp;
        const alerts: Omit<DockerAlertSummary, 'id'>[] = [];
        if (!snapshot.daemonReachable) {
            alerts.push({
                severity: 'critical',
                title: 'Docker daemon unreachable',
                message: snapshot.daemonError || 'Docker socket is unavailable or permission was denied.',
                source: 'daemon',
                active: true,
                firstSeenAt: now,
                lastSeenAt: now,
            });
        }

        if (snapshot.diskUsage.usedPercent >= 90) {
            alerts.push({
                severity: 'critical',
                title: 'Docker disk usage above 90%',
                message: `Docker storage is at ${snapshot.diskUsage.usedPercent.toFixed(1)}%.`,
                source: 'disk',
                active: true,
                firstSeenAt: now,
                lastSeenAt: now,
            });
        } else if (snapshot.diskUsage.usedPercent >= 80) {
            alerts.push({
                severity: 'warning',
                title: 'Docker disk usage above 80%',
                message: `Docker storage is at ${snapshot.diskUsage.usedPercent.toFixed(1)}%.`,
                source: 'disk',
                active: true,
                firstSeenAt: now,
                lastSeenAt: now,
            });
        }

        for (const container of snapshot.containers) {
            if (container.state === 'exited') {
                alerts.push({
                    severity: 'critical',
                    title: `${container.name} stopped unexpectedly`,
                    message: `Container status is "${container.status}".`,
                    source: container.name,
                    active: true,
                    firstSeenAt: now,
                    lastSeenAt: now,
                });
            }
            if (container.restartCount > 3) {
                alerts.push({
                    severity: 'critical',
                    title: `${container.name} restart loop`,
                    message: `${container.restartCount} restarts detected within the recent observation window.`,
                    source: container.name,
                    active: true,
                    firstSeenAt: now,
                    lastSeenAt: now,
                });
            }
            if (container.cpuPercent >= 95) {
                alerts.push({
                    severity: 'critical',
                    title: `${container.name} CPU above 95%`,
                    message: `Current CPU usage is ${container.cpuPercent.toFixed(1)}%.`,
                    source: container.name,
                    active: true,
                    firstSeenAt: now,
                    lastSeenAt: now,
                });
            } else if (container.cpuPercent >= 80) {
                alerts.push({
                    severity: 'warning',
                    title: `${container.name} CPU above 80%`,
                    message: `Current CPU usage is ${container.cpuPercent.toFixed(1)}%.`,
                    source: container.name,
                    active: true,
                    firstSeenAt: now,
                    lastSeenAt: now,
                });
            }
            if (container.memoryPercent >= 95) {
                alerts.push({
                    severity: 'critical',
                    title: `${container.name} memory above 95%`,
                    message: `Current memory usage is ${container.memoryPercent.toFixed(1)}% of its limit.`,
                    source: container.name,
                    active: true,
                    firstSeenAt: now,
                    lastSeenAt: now,
                });
            } else if (container.memoryPercent >= 80) {
                alerts.push({
                    severity: 'warning',
                    title: `${container.name} memory above 80%`,
                    message: `Current memory usage is ${container.memoryPercent.toFixed(1)}% of its limit.`,
                    source: container.name,
                    active: true,
                    firstSeenAt: now,
                    lastSeenAt: now,
                });
            }
        }
        return this.persistAlerts(alerts);
    }

    private async readDockerSnapshot(): Promise<DockerSnapshot> {
        const now = new Date().toISOString();
        type RawPs = {
            ID: string;
            Names: string;
            Image: string;
            Command: string;
            State: string;
            Status: string;
            RunningFor: string;
            CreatedAt?: string;
            Ports?: string;
        };
        type RawStats = {
            ID: string;
            Name: string;
            CPUPerc: string;
            MemPerc: string;
            MemUsage: string;
            BlockIO: string;
            NetIO: string;
        };
        type RawImage = {
            ID: string;
            Repository: string;
            Tag: string;
            Size: string;
            CreatedAt?: string;
        };
        type RawVolume = { Name: string; Driver: string; Scope?: string; Mountpoint?: string };
        type RawNetwork = { ID: string; Name: string; Driver: string; Scope?: string };
        type RawEvent = { Type: string; Action: string; id?: string; Actor?: { ID?: string; Attributes?: Record<string, string> }; time?: number; timeNano?: number };

        const [psRaw, statsRaw, imagesRaw, volumesRaw, networksRaw, infoRaw, dfRaw] = await Promise.all([
            this.runDocker(['ps', '-a', '--no-trunc', '--format', 'json']),
            this.runDocker(['stats', '--no-stream', '--format', 'json']),
            this.runDocker(['images', '--no-trunc', '--format', 'json']),
            this.runDocker(['volume', 'ls', '--format', 'json']),
            this.runDocker(['network', 'ls', '--format', 'json']),
            this.runDocker(['info', '--format', '{{json .}}']),
            this.runDocker(['system', 'df', '--format', '{{json .}}']),
        ]);

        let eventsRaw = '';
        try {
            eventsRaw = await this.runDocker(['events', '--since', '5m', '--until', '0s', '--format', '{{json .}}']);
        } catch {
            eventsRaw = '';
        }

        const info = JSON.parse(infoRaw || '{}') as Record<string, unknown>;
        const ps = parseJsonLines<RawPs>(psRaw);
        const stats = new Map(parseJsonLines<RawStats>(statsRaw).map((entry) => [entry.ID, entry]));
        const images = parseJsonLines<RawImage>(imagesRaw);
        const volumes = parseJsonLines<RawVolume>(volumesRaw);
        const networks = parseJsonLines<RawNetwork>(networksRaw);
        const events = parseJsonLines<RawEvent>(eventsRaw).map((event, index) => ({
            id: `${event.Actor?.ID || event.id || event.Action}-${index}`,
            time: toIso(event.time ? event.time * 1000 : Date.now()),
            action: event.Action,
            type: event.Type,
            actor: safeName(event.Actor?.Attributes?.name || event.Actor?.ID || 'docker'),
            attributes: event.Actor?.Attributes || {},
        }));
        const recentEvents = [...events, ...this.recentEvents].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 25);
        this.recentEvents = recentEvents;

        const inspectIds = ps.map((container) => container.ID).filter(Boolean);
        const inspectMap = new Map<string, Record<string, unknown>>();
        if (inspectIds.length > 0) {
            try {
                const inspectRaw = await this.runDocker(['inspect', ...inspectIds]);
                const inspectList = JSON.parse(inspectRaw) as Array<Record<string, unknown>>;
                for (const inspect of inspectList) {
                    const id = String(inspect.Id || '');
                    if (id) {
                        inspectMap.set(id, inspect);
                    }
                }
            } catch {
                // Container detail panel remains partially populated if inspect fails.
            }
        }

        const containerList: DockerContainerSummary[] = ps.map((container) => {
            const stat = stats.get(container.ID);
            const inspect = inspectMap.get(container.ID);
            const networkSettings = inspect?.NetworkSettings as { Networks?: Record<string, unknown> } | undefined;
            const mounts = Array.isArray(inspect?.Mounts)
                ? (inspect?.Mounts as Array<Record<string, unknown>>).map((mount) => ({
                    source: String(mount.Source || ''),
                    destination: String(mount.Destination || ''),
                    mode: String(mount.Mode || ''),
                    rw: Boolean(mount.RW),
                }))
                : [];
            const env = Array.isArray((inspect?.Config as { Env?: string[] } | undefined)?.Env)
                ? ((inspect?.Config as { Env?: string[] }).Env ?? [])
                : [];
            const memoryUsageParts = stat?.MemUsage?.split('/');
            const blockParts = stat?.BlockIO?.split('/');
            const netParts = stat?.NetIO?.split('/');
            return {
                id: container.ID,
                name: safeName(container.Names),
                image: container.Image,
                imageId: typeof inspect?.Image === 'string' ? inspect.Image : undefined,
                command: container.Command,
                state: container.State,
                status: container.Status,
                createdAt: toIso(container.CreatedAt || now),
                ports: summarizePorts(container.Ports),
                networks: Object.keys(networkSettings?.Networks || {}),
                mounts,
                env,
                restartCount: Number((inspect?.RestartCount as number | undefined) || (inspect?.State as { Restarting?: boolean } | undefined)?.Restarting ? 1 : 0),
                cpuPercent: parsePercent(stat?.CPUPerc),
                memoryPercent: parsePercent(stat?.MemPerc),
                memoryUsageBytes: parseSize(memoryUsageParts?.[0]),
                memoryLimitBytes: parseSize(memoryUsageParts?.[1]),
                blockReadBytes: parseSize(blockParts?.[0]),
                blockWriteBytes: parseSize(blockParts?.[1]),
                networkInBytes: parseSize(netParts?.[0]),
                networkOutBytes: parseSize(netParts?.[1]),
            };
        });

        const imageUseCount = new Map<string, number>();
        for (const container of containerList) {
            const key = container.imageId || container.image;
            imageUseCount.set(key, (imageUseCount.get(key) || 0) + 1);
        }

        const diskUsageJson = JSON.parse(dfRaw || '{}') as Record<string, unknown>;
        const imagesBytes = parseSize(String(diskUsageJson.ImagesSize || '0 B'));
        const containersBytes = parseSize(String(diskUsageJson.ContainersSpaceReclaimable || '0 B'));
        const volumesBytes = parseSize(String(diskUsageJson.VolumesSpaceReclaimable || '0 B'));
        const buildCacheBytes = parseSize(String(diskUsageJson.BuildCache || '0 B'));
        const totalBytes = imagesBytes + containersBytes + volumesBytes + buildCacheBytes;
        const diskCap = Number(info.DockerRootDirSize || info.MemTotal || 1) || 1;

        return {
            source: 'docker',
            daemonReachable: true,
            daemon: {
                name: String(info.Name || 'docker'),
                serverVersion: String(info.ServerVersion || ''),
                apiVersion: String(info.ApiVersion || ''),
                operatingSystem: String(info.OperatingSystem || ''),
                architecture: String(info.Architecture || ''),
                containersRunning: Number(info.ContainersRunning || containerList.filter((item) => item.state === 'running').length),
                containersStopped: Number(info.ContainersStopped || containerList.filter((item) => item.state === 'exited').length),
                containersPaused: Number(info.ContainersPaused || containerList.filter((item) => item.state === 'paused').length),
                storageDriver: String(info.Driver || ''),
                cgroupVersion: String(info.CgroupVersion || ''),
            },
            diskUsage: {
                imagesBytes,
                containersBytes,
                volumesBytes,
                buildCacheBytes,
                totalBytes,
                usedPercent: (totalBytes / diskCap) * 100,
            },
            containers: containerList,
            images: images.map((image) => ({
                id: image.ID,
                repository: image.Repository,
                tag: image.Tag,
                sizeBytes: parseSize(image.Size),
                createdAt: toIso(image.CreatedAt || now),
                containersUsing: imageUseCount.get(image.ID) || imageUseCount.get(`${image.Repository}:${image.Tag}`) || 0,
            })),
            volumes: volumes.map((volume) => ({
                name: volume.Name,
                driver: volume.Driver,
                scope: volume.Scope,
                mountpoint: volume.Mountpoint,
            })),
            networks: networks.map((network) => ({
                id: network.ID,
                name: network.Name,
                driver: network.Driver,
                scope: network.Scope,
            })),
            events: recentEvents,
            alerts: [],
            history: [],
            timestamp: now,
        };
    }

    async getSnapshot() {
        let snapshot: DockerSnapshot;
        try {
            snapshot = this.shouldUseMockMode() ? this.buildMockSnapshot() : await this.readDockerSnapshot();
        } catch (error) {
            if (this.shouldUseMockMode()) {
                snapshot = this.buildMockSnapshot();
            } else {
                const message = error instanceof Error ? error.message : 'Docker daemon is unavailable.';
                snapshot = {
                    source: 'docker',
                    daemonReachable: false,
                    daemonError: message,
                    daemon: {
                        name: 'docker',
                        serverVersion: '',
                        apiVersion: '',
                        operatingSystem: '',
                        architecture: '',
                        containersRunning: 0,
                        containersStopped: 0,
                        containersPaused: 0,
                        storageDriver: '',
                    },
                    diskUsage: {
                        imagesBytes: 0,
                        containersBytes: 0,
                        volumesBytes: 0,
                        buildCacheBytes: 0,
                        totalBytes: 0,
                        usedPercent: 0,
                    },
                    containers: [],
                    images: [],
                    volumes: [],
                    networks: [],
                    events: this.recentEvents,
                    alerts: [],
                    history: [],
                    timestamp: new Date().toISOString(),
                };
            }
        }

        this.pushHistory(snapshot);
        snapshot.history = this.history;
        snapshot.alerts = await this.buildAlerts(snapshot);
        await this.persistHistory(snapshot);
        return snapshot;
    }

    async performAction(containerId: string, action: 'start' | 'stop' | 'restart') {
        if (this.shouldUseMockMode()) {
            this.mockContainers = this.mockContainers.map((container) => {
                if (container.id !== containerId) return container;
                if (action === 'start') {
                    return { ...container, state: 'running', status: 'Up 3 seconds', restartCount: container.restartCount };
                }
                if (action === 'stop') {
                    return { ...container, state: 'exited', status: 'Exited (0) just now', cpuPercent: 0, memoryPercent: 0, memoryUsageBytes: 0 };
                }
                return { ...container, state: 'running', status: 'Up 1 second', restartCount: container.restartCount + 1 };
            });
            const actedOn = this.mockContainers.find((container) => container.id === containerId);
            this.mockEvents.unshift({
                id: `evt-${Date.now()}`,
                time: new Date().toISOString(),
                action,
                type: 'container',
                actor: actedOn?.name || containerId,
                attributes: {},
            });
            this.mockEvents = this.mockEvents.slice(0, 25);
            return { ok: true, message: `${action} completed`, container: actedOn };
        }

        await this.runDocker([action, containerId]);
        const snapshot = await this.getSnapshot();
        return {
            ok: true,
            message: `${action} completed`,
            container: snapshot.containers.find((container) => container.id === containerId),
        };
    }
}

export const dockerService = new DockerService();
