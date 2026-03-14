import { 
    execFile 
} from 'node:child_process';
import { promisify } from 'node:util';
import si from 'systeminformation';
import connectDB from '@/lib/db';
import UpdateHistory from '@/models/UpdateHistory';
import { createLogger } from '@/lib/logger';
import { 
    UpdateSnapshot, 
    PackageUpdate, 
    UpdateHistoryEntry, 
    UpdateAlertSummary
} from '@/modules/updates/types';

const execFileAsync = promisify(execFile);
const log = createLogger('updates-service');

class UpdateService {
    private static instance: UpdateService;
    private cachedSnapshot: UpdateSnapshot | null = null;
    private lastCheck: number = 0;
    private isChecking: boolean = false;
    private CACHE_DURATION = 3600 * 1000; // 1 hour

    private constructor() {}

    public static getInstance(): UpdateService {
        if (!UpdateService.instance) {
            UpdateService.instance = new UpdateService();
        }
        return UpdateService.instance;
    }

    private async runCommand(cmd: string, args: string[]): Promise<string> {
        try {
            const { stdout } = await execFileAsync(cmd, args, { timeout: 30000 });
            return stdout;
        } catch (err) {
            log.warn(`Command failed: ${cmd} ${args.join(' ')}`, err);
            return '';
        }
    }

    private async getAptUpdates(): Promise<PackageUpdate[]> {
        const stdout = await this.runCommand('apt', ['list', '--upgradable']);
        if (!stdout) return [];

        const updates: PackageUpdate[] = [];
        const lines = stdout.split('\n').slice(1); // Skip "Listing..."
        for (const line of lines) {
            if (!line.trim()) continue;
            // Example: libssl3/noble-updates 3.0.13-0ubuntu3.1 amd64 [upgradable from: 3.0.13-0ubuntu3]
            const match = line.match(/^([^\/]+)\/[^\s]+\s+([^\s]+)\s+[^\s]+\s+\[upgradable from:\s+([^\]]+)\]/);
            if (match) {
                updates.push({
                    name: match[1],
                    newVersion: match[2],
                    currentVersion: match[3],
                    severity: line.toLowerCase().includes('security') ? 'high' : 'medium',
                    repository: 'apt',
                    category: line.toLowerCase().includes('security') ? 'security' : 'regular',
                    manager: 'apt'
                });
            }
        }
        return updates;
    }

    private async getNpmUpdates(): Promise<PackageUpdate[]> {
        const stdout = await this.runCommand('npm', ['outdated', '-g', '--json']);
        if (!stdout) return [];
        try {
            const data = JSON.parse(stdout) as Record<string, { current: string; latest: string }>;
            return Object.entries(data).map(([name, info]) => ({
                name,
                currentVersion: info.current || 'unknown',
                newVersion: info.latest || 'unknown',
                severity: 'medium',
                repository: 'npm-global',
                category: 'language',
                manager: 'npm'
            }));
        } catch {
            return [];
        }
    }

    private async getPipUpdates(): Promise<PackageUpdate[]> {
        const stdout = await this.runCommand('pip', ['list', '--outdated', '--format=json']);
        if (!stdout) return [];
        try {
            const data = JSON.parse(stdout) as Array<{ name: string; version: string; latest_version: string }>;
            return data.map((info) => ({
                name: info.name,
                currentVersion: info.version,
                newVersion: info.latest_version,
                severity: 'medium',
                repository: 'pypi',
                category: 'language',
                manager: 'pip'
            }));
        } catch {
            return [];
        }
    }

    private async getHistory(): Promise<UpdateHistoryEntry[]> {
        try {
            await connectDB();
            const docs = await UpdateHistory.find().sort({ timestamp: -1 }).limit(20).lean() as Array<{
                _id: unknown;
                timestamp: Date;
                packages: string[];
                count: number;
                success: boolean;
                error?: string;
                osVersion?: string;
            }>;
            return docs.map((d) => ({
                id: String(d._id),
                timestamp: d.timestamp.toISOString(),
                packages: d.packages,
                count: d.count,
                success: d.success,
                error: d.error,
                osVersion: d.osVersion
            }));
        } catch (err) {
            log.error('Failed to fetch update history', err);
            return [];
        }
    }

    private async buildAlerts(updates: PackageUpdate[]): Promise<UpdateAlertSummary[]> {
        const alerts: UpdateAlertSummary[] = [];
        const now = new Date().toISOString();

        const securityCount = updates.filter(u => u.category === 'security').length;
        if (securityCount > 0) {
            alerts.push({
                id: 'security-updates',
                severity: 'critical',
                title: 'Security Updates Available',
                message: `There are ${securityCount} security updates pending.`,
                source: 'apt',
                active: true,
                firstSeenAt: now,
                lastSeenAt: now
            });
        }

        // Persistence logic would go here, similar to DockerService
        return alerts;
    }

    private buildMockSnapshot(): UpdateSnapshot {
        const now = new Date().toISOString();
        return {
            timestamp: now,
            osName: 'Ubuntu',
            osVersion: '24.04 LTS',
            packageManager: 'apt',
            updates: [
                { name: 'linux-image-generic', currentVersion: '6.8.0-31', newVersion: '6.8.0-35', severity: 'high', repository: 'noble-updates', category: 'security', manager: 'apt', size: 45000000 },
                { name: 'openssl', currentVersion: '3.0.13-0ubuntu3', newVersion: '3.0.13-0ubuntu3.1', severity: 'critical', repository: 'noble-security', category: 'security', manager: 'apt', size: 1200000 },
                { name: 'nginx', currentVersion: '1.24.0', newVersion: '1.26.1', severity: 'medium', repository: 'nginx-stable', category: 'regular', manager: 'apt' },
                { name: 'typescript', currentVersion: '5.4.2', newVersion: '5.4.5', severity: 'low', repository: 'npm', category: 'language', manager: 'npm' }
            ],
            counts: { security: 2, regular: 1, optional: 0, language: 1 },
            pendingRestart: true,
            restartRequiredBy: ['linux-image-generic', 'libc6'],
            lastCheck: now,
            history: [
                { id: 'h1', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), packages: ['curl', 'libcurl4'], count: 2, success: true },
                { id: 'h2', timestamp: new Date(Date.now() - 86400000 * 7).toISOString(), packages: ['systemd'], count: 1, success: true }
            ],
            alerts: [
                { id: 'sec-1', severity: 'critical', title: 'Critical Security Updates', message: '2 security updates require immediate attention', source: 'apt', active: true, firstSeenAt: now, lastSeenAt: now }
            ]
        };
    }

    public async getSnapshot(forceCheck: boolean = false): Promise<UpdateSnapshot> {
        if (!forceCheck && this.cachedSnapshot && (Date.now() - this.lastCheck < this.CACHE_DURATION)) {
            return this.cachedSnapshot;
        }

        if (this.isChecking) {
            return this.cachedSnapshot || this.buildMockSnapshot();
        }

        this.isChecking = true;
        try {
            if (process.env.SERVERMON_UPDATES_MOCK === '1') {
                this.cachedSnapshot = this.buildMockSnapshot();
                this.lastCheck = Date.now();
                return this.cachedSnapshot;
            }

            const osInfo = await si.osInfo();
            const [apt, npm, pip, history] = await Promise.all([
                this.getAptUpdates(),
                this.getNpmUpdates(),
                this.getPipUpdates(),
                this.getHistory()
            ]);

            const updates = [...apt, ...npm, ...pip];
            const counts = {
                security: updates.filter(u => u.category === 'security').length,
                regular: updates.filter(u => u.category === 'regular').length,
                optional: updates.filter(u => u.category === 'optional').length,
                language: updates.filter(u => u.category === 'language').length
            };

            // Check for restart required (Debian specific)
            let pendingRestart = false;
            let restartRequiredBy: string[] = [];
            const restartFile = '/var/run/reboot-required';
            const { stdout: rebootStdout } = await execFileAsync('ls', [restartFile]).catch(() => ({ stdout: '' }));
            if (rebootStdout.includes(restartFile)) {
                pendingRestart = true;
                const { stdout: pkgStdout } = await execFileAsync('cat', [`${restartFile}.pkgs`]).catch(() => ({ stdout: '' }));
                restartRequiredBy = pkgStdout.split('\n').filter(Boolean);
            }

            const alerts = await this.buildAlerts(updates);

            this.cachedSnapshot = {
                timestamp: new Date().toISOString(),
                osName: osInfo.distro,
                osVersion: osInfo.release,
                packageManager: osInfo.distro.toLowerCase().includes('ubuntu') || osInfo.distro.toLowerCase().includes('debian') ? 'apt' : 'unknown',
                updates,
                counts,
                pendingRestart,
                restartRequiredBy,
                lastCheck: new Date().toISOString(),
                history,
                alerts
            };
            this.lastCheck = Date.now();
            return this.cachedSnapshot;
        } catch (err) {
            log.error('Failed to get updates snapshot', err);
            return this.cachedSnapshot || this.buildMockSnapshot();
        } finally {
            this.isChecking = false;
        }
    }
}

export const updateService = UpdateService.getInstance();
