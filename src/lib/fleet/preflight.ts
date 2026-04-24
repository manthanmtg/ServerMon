export type PreflightStatus = 'pass' | 'fail' | 'warn' | 'skip' | 'unknown';

export interface PreflightResult {
  id: string;
  label: string;
  status: PreflightStatus;
  detail?: string;
  fix?: string;
  evidence?: string;
  durationMs: number;
}

export interface PreflightExecutors {
  checkPortAvailable?: (port: number) => Promise<{ available: boolean; detail?: string }>;
  checkPortReachable?: (
    host: string,
    port: number
  ) => Promise<{ reachable: boolean; detail?: string }>;
  checkNginxBinary?: (
    binaryPath?: string
  ) => Promise<{ present: boolean; version?: string; detail?: string }>;
  checkNginxManagedDir?: (dir: string) => Promise<{ writable: boolean; detail?: string }>;
  checkMongoConnection?: () => Promise<{
    connected: boolean;
    detail?: string;
  }>;
  checkDiskFree?: (path: string, minMb: number) => Promise<{ freeMb: number; ok: boolean }>;
  checkDns?: (host: string) => Promise<{ resolves: boolean; records?: string[]; detail?: string }>;
  checkTlsCertificate?: (
    domain: string
  ) => Promise<{ present: boolean; expiresAt?: Date; detail?: string }>;
  detectServiceManager?: () => Promise<{ manager: string }>;
  checkFrpBinary?: () => Promise<{ present: boolean; version?: string }>;
}

export interface PreflightEnv {
  frpBindPort: number;
  vhostHttpPort: number;
  vhostHttpsPort?: number;
  publicHostname?: string;
  nginxManagedDir?: string;
  nginxBinaryPath?: string;
  minDiskFreeMb?: number;
}

const DEFAULT_MIN_DISK_FREE_MB = 500;

interface CheckDef {
  id: string;
  label: string;
  run: (
    env: PreflightEnv,
    ex: PreflightExecutors
  ) => Promise<Omit<PreflightResult, 'id' | 'label' | 'durationMs'> | null>;
  fixOnFail: string;
}

const CHECKS: CheckDef[] = [
  {
    id: 'mongo.connection',
    label: 'MongoDB connection',
    fixOnFail: 'Verify MONGO_URI is correct and the database is reachable from this host.',
    run: async (_env, ex) => {
      if (!ex.checkMongoConnection) return null;
      const r = await ex.checkMongoConnection();
      return {
        status: r.connected ? 'pass' : 'fail',
        detail: r.detail,
        evidence: r.detail,
      };
    },
  },
  {
    id: 'frp.binaryPresent',
    label: 'FRP binary present',
    fixOnFail: 'Install FRP binary (frps/frpc) or trigger the auto-downloader.',
    run: async (_env, ex) => {
      if (!ex.checkFrpBinary) return null;
      const r = await ex.checkFrpBinary();
      return {
        status: r.present ? 'pass' : 'fail',
        detail: r.version ? `FRP version ${r.version}` : r.present ? 'present' : 'missing',
      };
    },
  },
  {
    id: 'frp.bindPortAvailable',
    label: 'FRP bind port available',
    fixOnFail: '',
    run: async (env, ex) => {
      if (!ex.checkPortAvailable) return null;
      const r = await ex.checkPortAvailable(env.frpBindPort);
      if (r.available) return { status: 'pass' };
      return {
        status: 'fail',
        detail: r.detail,
        evidence: r.detail,
        fix: `Free port ${env.frpBindPort} or change FRP bind port in config.`,
      };
    },
  },
  {
    id: 'frp.vhostHttpPortAvailable',
    label: 'FRP vhost HTTP port available',
    fixOnFail: '',
    run: async (env, ex) => {
      if (!ex.checkPortAvailable) return null;
      const r = await ex.checkPortAvailable(env.vhostHttpPort);
      if (r.available) return { status: 'pass' };
      return {
        status: 'fail',
        detail: r.detail,
        evidence: r.detail,
        fix: `Free port ${env.vhostHttpPort} or change vhost HTTP port in config.`,
      };
    },
  },
  {
    id: 'frp.vhostHttpsPortAvailable',
    label: 'FRP vhost HTTPS port available',
    fixOnFail: '',
    run: async (env, ex) => {
      if (env.vhostHttpsPort === undefined) return { status: 'skip' };
      if (!ex.checkPortAvailable) return null;
      const r = await ex.checkPortAvailable(env.vhostHttpsPort);
      if (r.available) return { status: 'pass' };
      return {
        status: 'fail',
        detail: r.detail,
        evidence: r.detail,
        fix: `Free port ${env.vhostHttpsPort} or change vhost HTTPS port in config.`,
      };
    },
  },
  {
    id: 'nginx.binaryPresent',
    label: 'nginx binary present',
    fixOnFail:
      'Install nginx (apt/yum/brew) or set NGINX_BINARY_PATH to an existing nginx executable.',
    run: async (env, ex) => {
      if (!ex.checkNginxBinary) return null;
      const r = await ex.checkNginxBinary(env.nginxBinaryPath);
      return {
        status: r.present ? 'pass' : 'fail',
        detail: r.version ? `nginx ${r.version}` : r.detail,
      };
    },
  },
  {
    id: 'nginx.managedDirWritable',
    label: 'nginx managed dir writable',
    fixOnFail:
      'Ensure the nginx managed directory exists with correct owner/permissions (chmod/chown as needed).',
    run: async (env, ex) => {
      if (!env.nginxManagedDir) return { status: 'skip' };
      if (!ex.checkNginxManagedDir) return null;
      const r = await ex.checkNginxManagedDir(env.nginxManagedDir);
      return {
        status: r.writable ? 'pass' : 'fail',
        detail: r.detail,
        evidence: r.detail,
      };
    },
  },
  {
    id: 'dns.publicHostname',
    label: 'DNS resolves for public hostname',
    fixOnFail: 'Create an A/AAAA record for the public hostname pointing at this hub.',
    run: async (env, ex) => {
      if (!env.publicHostname) return { status: 'skip' };
      if (!ex.checkDns) return null;
      const r = await ex.checkDns(env.publicHostname);
      return {
        status: r.resolves ? 'pass' : 'fail',
        detail: r.records && r.records.length ? `records: ${r.records.join(', ')}` : r.detail,
        evidence: r.detail,
      };
    },
  },
  {
    id: 'tls.certificateLoaded',
    label: 'TLS certificate loaded',
    fixOnFail: 'Obtain a TLS certificate via ACME (or install one) for the public hostname.',
    run: async (env, ex) => {
      if (!env.publicHostname) return { status: 'skip' };
      if (!ex.checkTlsCertificate) return null;
      const r = await ex.checkTlsCertificate(env.publicHostname);
      if (r.present) {
        return {
          status: 'pass',
          detail: r.expiresAt ? `expires ${r.expiresAt.toISOString()}` : undefined,
        };
      }
      return {
        status: 'warn',
        detail: r.detail,
        evidence: r.detail,
      };
    },
  },
  {
    id: 'disk.freeMb',
    label: 'Disk free space',
    fixOnFail: 'Free up disk space on the install path or choose a different install path.',
    run: async (env, ex) => {
      if (!ex.checkDiskFree) return null;
      const minMb = env.minDiskFreeMb ?? DEFAULT_MIN_DISK_FREE_MB;
      const r = await ex.checkDiskFree('/', minMb);
      return {
        status: r.ok ? 'pass' : 'fail',
        detail: `${r.freeMb} MB free`,
      };
    },
  },
  {
    id: 'serviceManager.detected',
    label: 'Service manager detected',
    fixOnFail: 'Install systemd/launchd or configure a supported service manager.',
    run: async (_env, ex) => {
      if (!ex.detectServiceManager) return null;
      const r = await ex.detectServiceManager();
      return {
        status: r.manager ? 'pass' : 'unknown',
        detail: r.manager ? `detected: ${r.manager}` : undefined,
      };
    },
  },
];

export async function runPreflight(
  env: PreflightEnv,
  executors: PreflightExecutors
): Promise<PreflightResult[]> {
  const results: PreflightResult[] = [];
  for (const check of CHECKS) {
    const start = Date.now();
    let outcome: Omit<PreflightResult, 'id' | 'label' | 'durationMs'> | null = null;
    try {
      outcome = await check.run(env, executors);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      outcome = {
        status: 'fail',
        detail: msg,
        evidence: msg,
        fix: check.fixOnFail,
      };
    }
    const durationMs = Date.now() - start;

    if (outcome === null) {
      // Executor missing => skip
      results.push({
        id: check.id,
        label: check.label,
        status: 'skip',
        durationMs,
      });
      continue;
    }

    let fix = outcome.fix;
    if (outcome.status !== 'pass' && outcome.status !== 'skip' && !fix) {
      fix = check.fixOnFail || undefined;
    }

    results.push({
      id: check.id,
      label: check.label,
      status: outcome.status,
      detail: outcome.detail,
      evidence: outcome.evidence,
      fix,
      durationMs,
    });
  }
  return results;
}
