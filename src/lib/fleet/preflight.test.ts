import { describe, it, expect, vi } from 'vitest';
import { runPreflight, type PreflightExecutors, type PreflightEnv } from './preflight';

const baseEnv: PreflightEnv = {
  frpBindPort: 7000,
  vhostHttpPort: 8880,
  vhostHttpsPort: 8843,
  publicHostname: 'hub.example.com',
  nginxManagedDir: '/etc/nginx/servermon',
  nginxBinaryPath: '/usr/sbin/nginx',
  minDiskFreeMb: 500,
};

describe('runPreflight', () => {
  it('runs checks in documented order and skips when executor missing', async () => {
    const executors: PreflightExecutors = {};
    const results = await runPreflight(baseEnv, executors);
    const ids = results.map((r) => r.id);
    expect(ids).toEqual([
      'mongo.connection',
      'frp.binaryPresent',
      'frp.bindPortAvailable',
      'frp.vhostHttpPortAvailable',
      'frp.vhostHttpsPortAvailable',
      'nginx.binaryPresent',
      'nginx.managedDirWritable',
      'dns.publicHostname',
      'tls.certificateLoaded',
      'disk.freeMb',
      'serviceManager.detected',
    ]);
    // All should be skipped since no executors
    expect(results.every((r) => r.status === 'skip')).toBe(true);
    expect(results.every((r) => typeof r.durationMs === 'number')).toBe(true);
  });

  it('mongo.connection: pass when connected', async () => {
    const executors: PreflightExecutors = {
      checkMongoConnection: async () => ({ connected: true, detail: 'ok' }),
    };
    const results = await runPreflight(baseEnv, executors);
    const mongo = results.find((r) => r.id === 'mongo.connection');
    expect(mongo?.status).toBe('pass');
    expect(mongo?.fix).toBeUndefined();
  });

  it('mongo.connection: fail with fix when not connected', async () => {
    const executors: PreflightExecutors = {
      checkMongoConnection: async () => ({
        connected: false,
        detail: 'ECONNREFUSED',
      }),
    };
    const results = await runPreflight(baseEnv, executors);
    const mongo = results.find((r) => r.id === 'mongo.connection');
    expect(mongo?.status).toBe('fail');
    expect(mongo?.fix).toMatch(/MONGO_URI/);
    expect(mongo?.evidence).toBe('ECONNREFUSED');
  });

  it('frp.bindPortAvailable: pass when available', async () => {
    const executors: PreflightExecutors = {
      checkPortAvailable: async (port: number) => ({
        available: port === 7000,
      }),
    };
    const results = await runPreflight(baseEnv, executors);
    const bind = results.find((r) => r.id === 'frp.bindPortAvailable');
    expect(bind?.status).toBe('pass');
  });

  it('frp.bindPortAvailable: fail with fix when port busy', async () => {
    const executors: PreflightExecutors = {
      checkPortAvailable: async () => ({
        available: false,
        detail: 'EADDRINUSE',
      }),
    };
    const results = await runPreflight(baseEnv, executors);
    const bind = results.find((r) => r.id === 'frp.bindPortAvailable');
    expect(bind?.status).toBe('fail');
    expect(bind?.fix).toMatch(/7000/);
  });

  it('frp.vhostHttpsPortAvailable: skipped when vhostHttpsPort not set', async () => {
    const executors: PreflightExecutors = {
      checkPortAvailable: async () => ({ available: true }),
    };
    const env: PreflightEnv = { ...baseEnv, vhostHttpsPort: undefined };
    const results = await runPreflight(env, executors);
    const https = results.find((r) => r.id === 'frp.vhostHttpsPortAvailable');
    expect(https?.status).toBe('skip');
  });

  it('frp.binaryPresent: pass/fail via executor', async () => {
    const passExec: PreflightExecutors = {
      checkFrpBinary: async () => ({ present: true, version: '0.58.0' }),
    };
    const passResults = await runPreflight(baseEnv, passExec);
    expect(passResults.find((r) => r.id === 'frp.binaryPresent')?.status).toBe('pass');

    const failExec: PreflightExecutors = {
      checkFrpBinary: async () => ({ present: false }),
    };
    const failResults = await runPreflight(baseEnv, failExec);
    const failBin = failResults.find((r) => r.id === 'frp.binaryPresent');
    expect(failBin?.status).toBe('fail');
    expect(failBin?.fix).toMatch(/FRP/i);
  });

  it('nginx.binaryPresent and managedDirWritable with correct params', async () => {
    const nginxBin = vi.fn(async () => ({ present: true, version: '1.24' }));
    const nginxDir = vi.fn(async () => ({ writable: true }));
    const executors: PreflightExecutors = {
      checkNginxBinary: nginxBin,
      checkNginxManagedDir: nginxDir,
    };
    const results = await runPreflight(baseEnv, executors);
    expect(nginxBin).toHaveBeenCalledWith('/usr/sbin/nginx');
    expect(nginxDir).toHaveBeenCalledWith('/etc/nginx/servermon');
    expect(results.find((r) => r.id === 'nginx.binaryPresent')?.status).toBe('pass');
    expect(results.find((r) => r.id === 'nginx.managedDirWritable')?.status).toBe('pass');
  });

  it('nginx.managedDirWritable: skipped when nginxManagedDir not set', async () => {
    const nginxDir = vi.fn(async () => ({ writable: true }));
    const env: PreflightEnv = { ...baseEnv, nginxManagedDir: undefined };
    const results = await runPreflight(env, { checkNginxManagedDir: nginxDir });
    expect(results.find((r) => r.id === 'nginx.managedDirWritable')?.status).toBe('skip');
    expect(nginxDir).not.toHaveBeenCalled();
  });

  it('nginx.managedDirWritable: fail includes fix', async () => {
    const executors: PreflightExecutors = {
      checkNginxManagedDir: async () => ({
        writable: false,
        detail: 'EACCES',
      }),
    };
    const results = await runPreflight(baseEnv, executors);
    const r = results.find((r) => r.id === 'nginx.managedDirWritable');
    expect(r?.status).toBe('fail');
    expect(r?.fix).toMatch(/permission|chmod|owner/i);
  });

  it('dns.publicHostname: pass/fail and skipped without hostname', async () => {
    const executors: PreflightExecutors = {
      checkDns: async () => ({ resolves: true, records: ['1.2.3.4'] }),
    };
    const results = await runPreflight(baseEnv, executors);
    expect(results.find((r) => r.id === 'dns.publicHostname')?.status).toBe('pass');

    const env: PreflightEnv = { ...baseEnv, publicHostname: undefined };
    const skipResults = await runPreflight(env, executors);
    expect(skipResults.find((r) => r.id === 'dns.publicHostname')?.status).toBe('skip');
  });

  it('tls.certificateLoaded: warn when cert absent (not fail)', async () => {
    const executors: PreflightExecutors = {
      checkTlsCertificate: async () => ({
        present: false,
        detail: 'no cert',
      }),
    };
    const results = await runPreflight(baseEnv, executors);
    const tls = results.find((r) => r.id === 'tls.certificateLoaded');
    expect(tls?.status).toBe('warn');
    expect(tls?.fix).toMatch(/ACME|TLS|certificate/i);
  });

  it('tls.certificateLoaded: pass when present', async () => {
    const executors: PreflightExecutors = {
      checkTlsCertificate: async () => ({
        present: true,
        expiresAt: new Date('2026-12-31'),
      }),
    };
    const results = await runPreflight(baseEnv, executors);
    expect(results.find((r) => r.id === 'tls.certificateLoaded')?.status).toBe('pass');
  });

  it('disk.freeMb: pass and fail', async () => {
    const passExec: PreflightExecutors = {
      checkDiskFree: async (_path, _minMb) => ({ freeMb: 1024, ok: true }),
    };
    const passResults = await runPreflight(baseEnv, passExec);
    expect(passResults.find((r) => r.id === 'disk.freeMb')?.status).toBe('pass');

    const failExec: PreflightExecutors = {
      checkDiskFree: async () => ({ freeMb: 10, ok: false }),
    };
    const failResults = await runPreflight(baseEnv, failExec);
    const fail = failResults.find((r) => r.id === 'disk.freeMb');
    expect(fail?.status).toBe('fail');
    expect(fail?.fix).toMatch(/disk|free/i);
  });

  it('serviceManager.detected: returns detected manager', async () => {
    const executors: PreflightExecutors = {
      detectServiceManager: async () => ({ manager: 'systemd' }),
    };
    const results = await runPreflight(baseEnv, executors);
    const sm = results.find((r) => r.id === 'serviceManager.detected');
    expect(sm?.status).toBe('pass');
    expect(sm?.detail).toMatch(/systemd/);
  });

  it('catches thrown errors as status fail', async () => {
    const executors: PreflightExecutors = {
      checkMongoConnection: async () => {
        throw new Error('boom');
      },
    };
    const results = await runPreflight(baseEnv, executors);
    const mongo = results.find((r) => r.id === 'mongo.connection');
    expect(mongo?.status).toBe('fail');
    expect(mongo?.evidence).toMatch(/boom/);
    expect(mongo?.fix).toBeTruthy();
  });

  it('measures durationMs as a non-negative number', async () => {
    const executors: PreflightExecutors = {
      checkMongoConnection: async () => ({ connected: true }),
    };
    const results = await runPreflight(baseEnv, executors);
    for (const r of results) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses default minDiskFreeMb when not provided', async () => {
    const diskExec = vi.fn(async (_path: string, _minMb: number) => ({ freeMb: 1024, ok: true }));
    const env: PreflightEnv = { ...baseEnv, minDiskFreeMb: undefined };
    await runPreflight(env, { checkDiskFree: diskExec });
    expect(diskExec).toHaveBeenCalledTimes(1);
    const [, minMb] = diskExec.mock.calls[0];
    expect(typeof minMb).toBe('number');
    expect(minMb).toBeGreaterThan(0);
  });

  it('uses default vhostHttpsPort when not provided (skipped)', async () => {
    const portExec = vi.fn(async () => ({ available: true }));
    const env: PreflightEnv = { ...baseEnv, vhostHttpsPort: undefined };
    await runPreflight(env, { checkPortAvailable: portExec });
    // Called for bind + http, but not https since it's undefined -> skipped
    expect(portExec).toHaveBeenCalledTimes(2);
  });
});
