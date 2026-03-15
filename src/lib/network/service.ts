import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import si from 'systeminformation';
import connectDB from '@/lib/db';
import NetworkAlert from '@/models/NetworkAlert';
import NetworkStatAggregate from '@/models/NetworkStatAggregate';
import { analyticsService } from '@/lib/analytics';
import type {
  NetworkAlertSummary,
  NetworkConnection,
  NetworkInterface,
  NetworkSnapshot,
  NetworkStats,
} from '@/modules/network/types';

const execFileAsync = promisify(execFile);
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function toIso(value: unknown): string {
  const date =
    typeof value === 'string' || typeof value === 'number' ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
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

class NetworkService {
  private history: NetworkSnapshot['history'] = [];
  private lastMinuteBucket = '';

  private shouldUseMockMode() {
    return (
      process.env.SERVERMON_NETWORK_MOCK === '1' ||
      process.env.NODE_ENV === 'test' ||
      (!fs.existsSync('/proc/net/dev') && process.platform !== 'darwin')
    );
  }

  private async runCommand(cmd: string, args: string[]) {
    try {
      const { stdout } = await execFileAsync(cmd, args, { timeout: 5000 });
      return stdout;
    } catch {
      return '';
    }
  }

  private async parseConnections(): Promise<NetworkConnection[]> {
    const output = await this.runCommand('ss', ['-tunapl']);
    if (!output) return [];

    const lines = output.split('\n').slice(1);
    return lines
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return null;

        const processInfo = parts[6] || '';
        const processMatch = processInfo.match(/users:\(\("([^"]+)",pid=(\d+),/);

        const connection: NetworkConnection = {
          protocol: parts[0],
          state: parts[1],
          localAddress: parts[4].split(':').slice(0, -1).join(':') || parts[4],
          localPort: parts[4].split(':').pop() || '',
          peerAddress: parts[5].split(':').slice(0, -1).join(':') || parts[5],
          peerPort: parts[5].split(':').pop() || '',
          process: processMatch ? processMatch[1] : '-',
          pid: processMatch ? parseInt(processMatch[2], 10) : undefined,
        };
        return connection;
      })
      .filter((c): c is NetworkConnection => c !== null);
  }

  private buildMockSnapshot(): NetworkSnapshot {
    const now = new Date().toISOString();
    const mockIface = 'eth0';

    return {
      timestamp: now,
      interfaces: [
        {
          iface: mockIface,
          ip4: '192.168.1.10',
          ip6: 'fe80::1',
          mac: '00:11:22:33:44:55',
          internal: false,
          virtual: false,
          operstate: 'up',
          type: 'wired',
          duplex: 'full',
          mtu: 1500,
          speed: 1000,
          carrierChanges: 1,
        },
      ],
      stats: [
        {
          iface: mockIface,
          rx_bytes: 1024 * 1024 * 100,
          tx_bytes: 1024 * 1024 * 50,
          rx_packets: 10000,
          tx_packets: 5000,
          rx_errors: 0,
          tx_errors: 0,
          rx_dropped: 0,
          tx_dropped: 0,
          rx_sec: 1024 * 50,
          tx_sec: 1024 * 20,
          ms: 1000,
        },
      ],
      connections: [
        {
          protocol: 'tcp',
          state: 'ESTABLISHED',
          localAddress: '127.0.0.1',
          localPort: '8912',
          peerAddress: '127.0.0.1',
          peerPort: '45321',
          process: 'node',
        },
        {
          protocol: 'tcp',
          state: 'LISTEN',
          localAddress: '0.0.0.0',
          localPort: '22',
          peerAddress: '0.0.0.0',
          peerPort: '*',
          process: 'sshd',
        },
      ],
      alerts: [],
      history: this.history,
    };
  }

  private pushHistory(snapshot: NetworkSnapshot) {
    this.history.push({
      timestamp: snapshot.timestamp,
      stats: snapshot.stats.map((s) => ({
        iface: s.iface,
        rx_sec: s.rx_sec,
        tx_sec: s.tx_sec,
      })),
    });
    this.history = this.history.slice(-120);
  }

  private async persistHistory(snapshot: NetworkSnapshot) {
    const currentBucket = new Date(snapshot.timestamp);
    currentBucket.setSeconds(0, 0);
    const bucketStart = currentBucket.toISOString();

    if (bucketStart === this.lastMinuteBucket) return;
    this.lastMinuteBucket = bucketStart;

    if (!(await tryConnectDB())) return;

    await NetworkStatAggregate.findOneAndUpdate(
      { bucketStart: currentBucket },
      {
        bucketStart: currentBucket,
        interfaces: snapshot.stats.map((s) => ({
          iface: s.iface,
          rx_sec: s.rx_sec,
          tx_sec: s.tx_sec,
        })),
      },
      { upsert: true }
    );

    await NetworkStatAggregate.deleteMany({ bucketStart: { $lt: new Date(Date.now() - DAY_MS) } });
  }

  private async buildAlerts(snapshot: NetworkSnapshot): Promise<NetworkAlertSummary[]> {
    const now = snapshot.timestamp;
    const alerts: Omit<NetworkAlertSummary, 'id'>[] = [];

    for (const iface of snapshot.interfaces) {
      if (iface.operstate !== 'up' && !iface.internal) {
        alerts.push({
          severity: 'critical',
          title: `Interface ${iface.iface} is down`,
          message: `Network interface ${iface.iface} is reported as ${iface.operstate}.`,
          source: iface.iface,
          active: true,
          firstSeenAt: now,
          lastSeenAt: now,
        });
      }
    }

    for (const stat of snapshot.stats) {
      if (stat.rx_errors > 0 || stat.tx_errors > 0) {
        alerts.push({
          severity: 'warning',
          title: `Network errors on ${stat.iface}`,
          message: `${stat.rx_errors + stat.tx_errors} errors detected on interface ${stat.iface}.`,
          source: stat.iface,
          active: true,
          firstSeenAt: now,
          lastSeenAt: now,
        });
      }
    }

    if (!(await tryConnectDB())) {
      return alerts.map((a, i) => ({ ...a, id: `temp-${i}` }));
    }

    const fingerprints = alerts.map((a) => `${a.source}:${a.title}`);
    await NetworkAlert.updateMany(
      { active: true, fingerprint: { $nin: fingerprints } },
      { $set: { active: false, resolvedAt: new Date() } }
    );

    const summaries: NetworkAlertSummary[] = [];
    for (const alert of alerts) {
      const fingerprint = `${alert.source}:${alert.title}`;
      const doc = await NetworkAlert.findOneAndUpdate(
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

      summaries.push({
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
        moduleId: 'network-monitor',
        event: 'network:alert',
        severity: alert.severity === 'critical' ? 'error' : 'warn',
        metadata: {
          title: alert.title,
          source: alert.source,
        },
      });
    }

    return summaries;
  }

  public async getSnapshot(): Promise<NetworkSnapshot> {
    let snapshot: NetworkSnapshot;

    if (this.shouldUseMockMode()) {
      snapshot = this.buildMockSnapshot();
    } else {
      try {
        const [interfaces, stats, connections] = await Promise.all([
          si.networkInterfaces(),
          si.networkStats(),
          this.parseConnections(),
        ]);

        const ifaceList: NetworkInterface[] = (
          Array.isArray(interfaces) ? interfaces : [interfaces]
        ).map((i) => ({
          iface: i.iface,
          ip4: i.ip4,
          ip6: i.ip6,
          mac: i.mac,
          internal: i.internal,
          virtual: i.virtual,
          operstate: i.operstate,
          type: i.type,
          duplex: i.duplex,
          mtu: i.mtu || 1500,
          speed: i.speed || 0,
          carrierChanges: i.carrierChanges || 0,
        }));

        const statList: NetworkStats[] = (Array.isArray(stats) ? stats : [stats]).map((s) => {
          const statsData = s as unknown as {
            rx_packets: number;
            tx_packets: number;
            [key: string]: unknown;
          };
          return {
            iface: s.iface,
            rx_bytes: s.rx_bytes,
            tx_bytes: s.tx_bytes,
            rx_packets: statsData.rx_packets || 0,
            tx_packets: statsData.tx_packets || 0,
            rx_errors: s.rx_errors,
            tx_errors: s.tx_errors,
            rx_dropped: s.rx_dropped,
            tx_dropped: s.tx_dropped,
            rx_sec: s.rx_sec || 0,
            tx_sec: s.tx_sec || 0,
            ms: s.ms,
          };
        });

        snapshot = {
          timestamp: new Date().toISOString(),
          interfaces: ifaceList,
          stats: statList,
          connections,
          alerts: [],
          history: [],
        };
      } catch {
        snapshot = this.buildMockSnapshot();
      }
    }

    this.pushHistory(snapshot);
    snapshot.history = this.history;
    snapshot.alerts = await this.buildAlerts(snapshot);
    await this.persistHistory(snapshot);

    return snapshot;
  }
}

export const networkService = new NetworkService();
