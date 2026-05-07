import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { collectServerMonStatus, parseServerMonEnv, parseSystemctlShow } from './servermonStatus';

function makeSpawn(output: string, code = 0) {
  return vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(output));
      child.emit('close', code);
    });
    return child;
  });
}

describe('servermonStatus', () => {
  it('parses PORT from /etc/servermon/env with default fallback', () => {
    expect(parseServerMonEnv(undefined).port).toBe(8912);
    expect(parseServerMonEnv('MONGO_URI=mongodb://db\nPORT=9001\n').port).toBe(9001);
    expect(parseServerMonEnv('PORT=not-a-number\n').port).toBe(8912);
  });

  it('parses active systemd service output', () => {
    const parsed = parseSystemctlShow(
      [
        'LoadState=loaded',
        'ActiveState=active',
        'UnitFileState=enabled',
        'FragmentPath=/etc/systemd/system/servermon.service',
        'WorkingDirectory=/opt/servermon/current',
      ].join('\n')
    );

    expect(parsed).toEqual({
      installed: true,
      serviceState: 'running',
      serviceEnabled: true,
      installDir: '/opt/servermon/current',
    });
  });

  it('maps missing systemd service to missing state', () => {
    const parsed = parseSystemctlShow('LoadState=not-found\nActiveState=inactive\n');
    expect(parsed.installed).toBe(false);
    expect(parsed.serviceState).toBe('missing');
    expect(parsed.serviceEnabled).toBe('unknown');
  });

  it('collects healthy status from systemd, env, and local health probe', async () => {
    const spawnImpl = makeSpawn(
      [
        'LoadState=loaded',
        'ActiveState=active',
        'UnitFileState=enabled',
        'WorkingDirectory=/opt/servermon',
      ].join('\n')
    );
    const status = await collectServerMonStatus({
      spawnImpl: spawnImpl as never,
      readFile: vi.fn().mockResolvedValue('PORT=9002\n'),
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
      now: () => new Date('2026-04-29T00:00:00.000Z'),
    });

    expect(status).toMatchObject({
      installed: true,
      serviceName: 'servermon.service',
      serviceState: 'running',
      serviceEnabled: true,
      port: 9002,
      installDir: '/opt/servermon',
      healthUrl: 'http://127.0.0.1:9002/api/health/ping',
      healthStatus: 'healthy',
      lastCheckedAt: '2026-04-29T00:00:00.000Z',
    });
  });

  it('returns installed unhealthy when service exists but health probe fails', async () => {
    const status = await collectServerMonStatus({
      spawnImpl: makeSpawn('LoadState=loaded\nActiveState=failed\n') as never,
      readFile: vi.fn().mockResolvedValue(''),
      fetchImpl: vi.fn().mockRejectedValue(new Error('connection refused')),
      now: () => new Date('2026-04-29T00:00:00.000Z'),
    });

    expect(status.installed).toBe(true);
    expect(status.serviceState).toBe('failed');
    expect(status.healthStatus).toBe('unhealthy');
    expect(status.lastError).toContain('connection refused');
  });
});
