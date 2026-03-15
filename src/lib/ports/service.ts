import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSocket } from 'node:dgram';
import { createServer } from 'node:net';
import { createLogger } from '@/lib/logger';
import type { ListeningPort, PortCheckResult, PortsSnapshot } from '@/modules/ports/types';

const execFileAsync = promisify(execFile);
const log = createLogger('ports');

async function execCmd(cmd: string, args: string[], timeoutMs = 10000): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout;
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string };
    if (error.stdout) return error.stdout;
    throw err;
  }
}

async function getListeningPorts(): Promise<ListeningPort[]> {
  const platform = process.platform;
  const ports: ListeningPort[] = [];

  try {
    if (platform === 'linux') {
      const raw = await execCmd('ss', ['-tulnp']);
      const lines = raw.split('\n').slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const proto = parts[0].toLowerCase();
        const localAddr = parts[4];
        const lastColon = localAddr.lastIndexOf(':');
        if (lastColon === -1) continue;
        const address = localAddr.substring(0, lastColon);
        const port = parseInt(localAddr.substring(lastColon + 1), 10);
        if (isNaN(port)) continue;

        const state = proto.startsWith('udp') ? 'UNCONN' : parts[1] || 'LISTEN';
        const processInfo = parts.slice(6).join(' ');
        const pidMatch = processInfo.match(/pid=(\d+)/);
        const nameMatch = processInfo.match(/\("([^"]+)"/);

        ports.push({
          protocol: proto as ListeningPort['protocol'],
          port,
          address: address.replace(/^\[|\]$/g, ''),
          pid: pidMatch ? parseInt(pidMatch[1], 10) : null,
          process: nameMatch ? nameMatch[1] : '',
          user: '',
          state,
          family: proto.includes('6') ? 'IPv6' : 'IPv4',
        });
      }
    } else if (platform === 'darwin') {
      const raw = await execCmd('lsof', ['-i', '-P', '-n', '-sTCP:LISTEN']);
      const lines = raw.split('\n').slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9) continue;
        const processName = parts[0];
        const pid = parseInt(parts[1], 10);
        const user = parts[2];
        const name = parts[8];
        const lastColon = name.lastIndexOf(':');
        if (lastColon === -1) continue;
        const port = parseInt(name.substring(lastColon + 1), 10);
        if (isNaN(port)) continue;
        const address = name.substring(0, lastColon);
        const isV6 = address.includes('[') || parts[4]?.includes('IPv6');

        ports.push({
          protocol: isV6 ? 'tcp6' : 'tcp',
          port,
          address: address.replace(/^\[|\]$/g, ''),
          pid: isNaN(pid) ? null : pid,
          process: processName,
          user,
          state: 'LISTEN',
          family: isV6 ? 'IPv6' : 'IPv4',
        });
      }

      // Also get UDP
      try {
        const udpRaw = await execCmd('lsof', ['-i', 'UDP', '-P', '-n']);
        const udpLines = udpRaw.split('\n').slice(1);
        for (const line of udpLines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 9) continue;
          const processName = parts[0];
          const pid = parseInt(parts[1], 10);
          const user = parts[2];
          const name = parts[8];
          const lastColon = name.lastIndexOf(':');
          if (lastColon === -1) continue;
          const port = parseInt(name.substring(lastColon + 1), 10);
          if (isNaN(port)) continue;
          const address = name.substring(0, lastColon);

          ports.push({
            protocol: 'udp',
            port,
            address: address.replace(/^\[|\]$/g, ''),
            pid: isNaN(pid) ? null : pid,
            process: processName,
            user,
            state: 'UNCONN',
            family: parts[4]?.includes('IPv6') ? 'IPv6' : 'IPv4',
          });
        }
      } catch {
        // UDP listing may fail
      }
    }
  } catch (err) {
    log.error('Failed to list ports', err);
  }

  return ports;
}

async function getFirewallInfo(): Promise<PortsSnapshot['firewall']> {
  const result: PortsSnapshot['firewall'] = {
    available: false,
    backend: 'none',
    enabled: false,
    rules: [],
  };

  if (process.platform !== 'linux') return result;

  // Try ufw first
  try {
    const raw = await execCmd('ufw', ['status', 'verbose']);
    result.available = true;
    result.backend = 'ufw';
    result.enabled = raw.includes('Status: active');

    const lines = raw.split('\n');
    let pastHeader = false;
    for (const line of lines) {
      if (line.startsWith('--')) {
        pastHeader = true;
        continue;
      }
      if (!pastHeader || !line.trim()) continue;
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length >= 3) {
        result.rules.push({
          chain: '',
          action: parts[1] || '',
          protocol: '',
          port: parts[0] || '',
          source: parts[2] || '',
          destination: '',
          raw: line.trim(),
        });
      }
    }
    return result;
  } catch {
    // ufw not available
  }

  // Try iptables
  try {
    const raw = await execCmd('iptables', ['-L', '-n', '--line-numbers']);
    result.available = true;
    result.backend = 'iptables';
    result.enabled = true;

    const lines = raw.split('\n');
    let currentChain = '';
    for (const line of lines) {
      if (line.startsWith('Chain')) {
        currentChain = line.split(' ')[1] || '';
        continue;
      }
      if (!line.trim() || line.startsWith('num')) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        result.rules.push({
          chain: currentChain,
          action: parts[1] || '',
          protocol: parts[2] || '',
          port: '',
          source: parts[3] || '',
          destination: parts[4] || '',
          raw: line.trim(),
        });
      }
    }
    return result;
  } catch {
    // iptables not available
  }

  return result;
}

async function checkPort(port: number): Promise<PortCheckResult> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve({ port, available: false });
      } else {
        resolve({ port, available: false });
      }
    });
    server.once('listening', () => {
      server.close(() => {
        // Also test UDP
        const udp = createSocket('udp4');
        udp.once('error', () => {
          resolve({ port, available: false });
        });
        udp.bind(port, () => {
          udp.close();
          resolve({ port, available: true });
        });
      });
    });
    server.listen(port, '0.0.0.0');
  });
}

function getMockData(): PortsSnapshot {
  return {
    timestamp: new Date().toISOString(),
    source: 'mock',
    listening: [
      {
        protocol: 'tcp',
        port: 22,
        address: '0.0.0.0',
        pid: 1234,
        process: 'sshd',
        user: 'root',
        state: 'LISTEN',
        family: 'IPv4',
      },
      {
        protocol: 'tcp',
        port: 80,
        address: '0.0.0.0',
        pid: 2345,
        process: 'nginx',
        user: 'www-data',
        state: 'LISTEN',
        family: 'IPv4',
      },
      {
        protocol: 'tcp',
        port: 443,
        address: '0.0.0.0',
        pid: 2345,
        process: 'nginx',
        user: 'www-data',
        state: 'LISTEN',
        family: 'IPv4',
      },
      {
        protocol: 'tcp',
        port: 3000,
        address: '127.0.0.1',
        pid: 3456,
        process: 'node',
        user: 'deploy',
        state: 'LISTEN',
        family: 'IPv4',
      },
      {
        protocol: 'tcp',
        port: 5432,
        address: '127.0.0.1',
        pid: 4567,
        process: 'postgres',
        user: 'postgres',
        state: 'LISTEN',
        family: 'IPv4',
      },
      {
        protocol: 'tcp',
        port: 6379,
        address: '127.0.0.1',
        pid: 5678,
        process: 'redis-server',
        user: 'redis',
        state: 'LISTEN',
        family: 'IPv4',
      },
      {
        protocol: 'tcp',
        port: 8912,
        address: '0.0.0.0',
        pid: 6789,
        process: 'node',
        user: 'deploy',
        state: 'LISTEN',
        family: 'IPv4',
      },
      {
        protocol: 'tcp',
        port: 27017,
        address: '127.0.0.1',
        pid: 7890,
        process: 'mongod',
        user: 'mongodb',
        state: 'LISTEN',
        family: 'IPv4',
      },
      {
        protocol: 'udp',
        port: 53,
        address: '0.0.0.0',
        pid: 8901,
        process: 'systemd-resolve',
        user: 'systemd-resolve',
        state: 'UNCONN',
        family: 'IPv4',
      },
      {
        protocol: 'udp',
        port: 68,
        address: '0.0.0.0',
        pid: 9012,
        process: 'dhclient',
        user: 'root',
        state: 'UNCONN',
        family: 'IPv4',
      },
    ],
    summary: {
      totalListening: 10,
      tcpCount: 8,
      udpCount: 2,
      uniqueProcesses: 8,
    },
    firewall: {
      available: false,
      backend: 'none',
      enabled: false,
      rules: [],
    },
  };
}

async function getSnapshot(): Promise<PortsSnapshot> {
  try {
    const [listening, firewall] = await Promise.all([getListeningPorts(), getFirewallInfo()]);

    if (listening.length === 0) {
      log.warn('No ports detected, returning mock data');
      return getMockData();
    }

    const tcpCount = listening.filter((p) => p.protocol.startsWith('tcp')).length;
    const udpCount = listening.filter((p) => p.protocol.startsWith('udp')).length;
    const uniqueProcesses = new Set(listening.map((p) => p.process).filter(Boolean)).size;

    return {
      timestamp: new Date().toISOString(),
      source: 'live',
      listening,
      summary: {
        totalListening: listening.length,
        tcpCount,
        udpCount,
        uniqueProcesses,
      },
      firewall,
    };
  } catch (err) {
    log.error('Failed to get ports snapshot', err);
    return getMockData();
  }
}

export const portsService = {
  getSnapshot,
  checkPort,
};
