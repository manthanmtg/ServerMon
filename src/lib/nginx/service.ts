import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { createLogger } from '@/lib/logger';
import type {
  NginxStatus,
  NginxVirtualHost,
  NginxConfigTest,
  NginxSnapshot,
} from '@/modules/nginx/types';

const execFileAsync = promisify(execFile);
const log = createLogger('nginx');

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
    if (error.stderr) return error.stderr;
    throw err;
  }
}

let nginxChecked = false;
let nginxAvailable = false;

async function checkNginx(): Promise<boolean> {
  if (nginxChecked) return nginxAvailable;
  try {
    await execCmd('nginx', ['-v']);
    nginxAvailable = true;
  } catch {
    nginxAvailable = false;
    log.warn('nginx not available');
  }
  nginxChecked = true;
  return nginxAvailable;
}

async function getNginxStatus(): Promise<NginxStatus> {
  const status: NginxStatus = {
    running: false,
    pid: null,
    version: '',
    configPath: '',
    uptime: '',
    workerProcesses: 0,
  };

  try {
    const versionRaw = await execCmd('nginx', ['-v']);
    const versionMatch = versionRaw.match(/nginx\/(\S+)/);
    status.version = versionMatch?.[1] || '';

    const configRaw = await execCmd('nginx', ['-t']);
    const configMatch = configRaw.match(/configuration file (.+) test/);
    status.configPath = configMatch?.[1] || '/etc/nginx/nginx.conf';
  } catch (err: unknown) {
    const error = err as { stderr?: string };
    if (error.stderr) {
      const versionMatch = error.stderr.match(/nginx\/(\S+)/);
      status.version = versionMatch?.[1] || '';
      const configMatch = error.stderr.match(/configuration file (.+) test/);
      status.configPath = configMatch?.[1] || '/etc/nginx/nginx.conf';
    }
  }

  // Check if running
  try {
    if (process.platform === 'linux') {
      const raw = await execCmd('systemctl', ['is-active', 'nginx']);
      status.running = raw.trim() === 'active';
      if (status.running) {
        const pidRaw = await execCmd('systemctl', ['show', 'nginx', '--property=MainPID']);
        const pidMatch = pidRaw.match(/MainPID=(\d+)/);
        status.pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
      }
    } else if (process.platform === 'darwin') {
      const raw = await execCmd('pgrep', ['-x', 'nginx']);
      const pids = raw.trim().split('\n').filter(Boolean);
      status.running = pids.length > 0;
      status.pid = pids[0] ? parseInt(pids[0], 10) : null;
      status.workerProcesses = Math.max(0, pids.length - 1);
    }
  } catch {
    status.running = false;
  }

  return status;
}

async function getVirtualHosts(): Promise<NginxVirtualHost[]> {
  const vhosts: NginxVirtualHost[] = [];
  const sitesAvailable = '/etc/nginx/sites-available';
  const sitesEnabled = '/etc/nginx/sites-enabled';

  try {
    const files = await readdir(sitesAvailable);
    const enabledFiles = new Set<string>();
    try {
      const enabled = await readdir(sitesEnabled);
      enabled.forEach((f) => enabledFiles.add(f));
    } catch {
      // sites-enabled might not exist
    }

    for (const file of files) {
      try {
        const content = await readFile(`${sitesAvailable}/${file}`, 'utf-8');
        const serverNames: string[] = [];
        const listenPorts: string[] = [];
        let root = '';
        let sslEnabled = false;
        let proxyPass = '';

        const serverNameMatches = content.matchAll(/server_name\s+([^;]+)/g);
        for (const m of serverNameMatches) {
          serverNames.push(...m[1].trim().split(/\s+/));
        }

        const listenMatches = content.matchAll(/listen\s+([^;]+)/g);
        for (const m of listenMatches) {
          listenPorts.push(m[1].trim());
          if (m[1].includes('ssl')) sslEnabled = true;
        }

        const rootMatch = content.match(/root\s+([^;]+)/);
        if (rootMatch) root = rootMatch[1].trim();

        const proxyMatch = content.match(/proxy_pass\s+([^;]+)/);
        if (proxyMatch) proxyPass = proxyMatch[1].trim();

        if (content.includes('ssl_certificate')) sslEnabled = true;

        vhosts.push({
          name: file,
          filename: file,
          enabled: enabledFiles.has(file),
          serverNames,
          listenPorts,
          root,
          sslEnabled,
          proxyPass,
          raw: content,
        });
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // sites-available doesn't exist (e.g. macOS, conf.d setup)
    try {
      const confDir = '/etc/nginx/conf.d';
      const files = await readdir(confDir);
      for (const file of files.filter((f) => f.endsWith('.conf'))) {
        try {
          const content = await readFile(`${confDir}/${file}`, 'utf-8');
          const serverNames: string[] = [];
          const listenPorts: string[] = [];

          const serverNameMatches = content.matchAll(/server_name\s+([^;]+)/g);
          for (const m of serverNameMatches) {
            serverNames.push(...m[1].trim().split(/\s+/));
          }

          const listenMatches = content.matchAll(/listen\s+([^;]+)/g);
          for (const m of listenMatches) {
            listenPorts.push(m[1].trim());
          }

          vhosts.push({
            name: file,
            filename: file,
            enabled: true,
            serverNames,
            listenPorts,
            root: '',
            sslEnabled: content.includes('ssl_certificate'),
            proxyPass: '',
            raw: content,
          });
        } catch {
          // skip
        }
      }
    } catch {
      // no conf.d either
    }
  }

  return vhosts;
}

function getMockData(): NginxSnapshot {
  return {
    timestamp: new Date().toISOString(),
    source: 'mock',
    available: false,
    status: {
      running: true,
      pid: 1234,
      version: '1.24.0',
      configPath: '/etc/nginx/nginx.conf',
      uptime: '15 days',
      workerProcesses: 4,
    },
    connections: {
      active: 142,
      reading: 3,
      writing: 8,
      waiting: 131,
      accepts: 1548203,
      handled: 1548203,
      requests: 4892741,
    },
    virtualHosts: [
      {
        name: 'default',
        filename: 'default',
        enabled: true,
        serverNames: ['_'],
        listenPorts: ['80 default_server'],
        root: '/var/www/html',
        sslEnabled: false,
        proxyPass: '',
        raw: '',
      },
      {
        name: 'servermon',
        filename: 'servermon',
        enabled: true,
        serverNames: ['monitor.example.com'],
        listenPorts: ['80', '443 ssl'],
        root: '',
        sslEnabled: true,
        proxyPass: 'http://127.0.0.1:8912',
        raw: '',
      },
      {
        name: 'api.example.com',
        filename: 'api.example.com',
        enabled: true,
        serverNames: ['api.example.com'],
        listenPorts: ['443 ssl'],
        root: '',
        sslEnabled: true,
        proxyPass: 'http://127.0.0.1:3000',
        raw: '',
      },
    ],
    summary: {
      totalVhosts: 3,
      enabledVhosts: 3,
      sslVhosts: 2,
      totalRequests: 4892741,
    },
  };
}

async function getSnapshot(): Promise<NginxSnapshot> {
  const available = await checkNginx();

  if (!available) {
    log.warn('nginx not available, returning mock data');
    return getMockData();
  }

  try {
    const [status, virtualHosts] = await Promise.all([getNginxStatus(), getVirtualHosts()]);

    const sslVhosts = virtualHosts.filter((v) => v.sslEnabled).length;
    const enabledVhosts = virtualHosts.filter((v) => v.enabled).length;

    return {
      timestamp: new Date().toISOString(),
      source: 'live',
      available: true,
      status,
      connections: null,
      virtualHosts,
      summary: {
        totalVhosts: virtualHosts.length,
        enabledVhosts,
        sslVhosts,
        totalRequests: 0,
      },
    };
  } catch (err) {
    log.error('Failed to get nginx snapshot', err);
    return getMockData();
  }
}

async function testConfig(): Promise<NginxConfigTest> {
  try {
    const raw = await execCmd('nginx', ['-t']);
    return { success: true, output: raw };
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    const output = error.stderr || error.message || 'Unknown error';
    return { success: output.includes('test is successful'), output };
  }
}

async function reloadNginx(): Promise<{ success: boolean; output: string }> {
  try {
    if (process.platform === 'linux') {
      const raw = await execCmd('systemctl', ['reload', 'nginx']);
      return { success: true, output: raw || 'Nginx reloaded successfully' };
    } else {
      const raw = await execCmd('nginx', ['-s', 'reload']);
      return { success: true, output: raw || 'Nginx reloaded successfully' };
    }
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    return { success: false, output: error.stderr || error.message || 'Unknown error' };
  }
}

export const nginxService = {
  getSnapshot,
  testConfig,
  reloadNginx,
};
