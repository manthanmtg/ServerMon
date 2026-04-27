/** @vitest-environment node */
import { execFile } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NetworkSpeedtestResult from '@/models/NetworkSpeedtestResult';
import NetworkSpeedtestSettings from '@/models/NetworkSpeedtestSettings';
import {
  getNextSpeedtestRunAt,
  normalizeSpeedtestOutput,
  runNetworkSpeedtest,
  updateNetworkSpeedtestSchedule,
} from './speedtest';

type ExecFileCallback = Parameters<typeof execFile>[3];

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/models/NetworkSpeedtestResult', () => ({
  default: {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('@/models/NetworkSpeedtestSettings', () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

function mockExecSuccess(stdout: string) {
  vi.mocked(execFile).mockImplementation(
    (
      _file: string,
      _args: readonly string[] | null | undefined,
      _options: unknown,
      callback: ExecFileCallback
    ) => {
      if (typeof callback === 'function') callback(null, stdout, '');
      return null as never;
    }
  );
}

function mockExecSequence(outputs: string[]) {
  let index = 0;
  vi.mocked(execFile).mockImplementation(
    (
      _file: string,
      _args: readonly string[] | null | undefined,
      _options: unknown,
      callback: ExecFileCallback
    ) => {
      if (typeof callback === 'function') callback(null, outputs[index++] ?? '', '');
      return null as never;
    }
  );
}

describe('network speedtest service', () => {
  const startedAt = new Date('2026-04-26T17:00:00.000Z');
  const finishedAt = new Date('2026-04-26T17:00:30.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(startedAt);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes Python speedtest-cli JSON output', () => {
    const result = normalizeSpeedtestOutput(
      JSON.stringify({
        download: 3044676505.8711677,
        upload: 1600740637.87022,
        ping: 2.156,
        server: {
          name: 'Espoo',
          country: 'Finland',
          sponsor: 'Suomi Communications Oy',
          id: '32643',
          latency: 2.156,
        },
        timestamp: '2026-04-26T17:40:24.128906Z',
        bytes_sent: 151519232,
        bytes_received: 409373932,
        share: null,
        client: {
          isp: 'CAIW Internet',
        },
      }),
      'python',
      'manual',
      startedAt,
      finishedAt
    );

    expect(result.status).toBe('completed');
    expect(result.downloadMbps).toBeCloseTo(3044.68, 2);
    expect(result.uploadMbps).toBeCloseTo(1600.74, 2);
    expect(result.pingMs).toBe(2.16);
    expect(result.serverName).toBe('Suomi Communications Oy');
    expect(result.serverLocation).toBe('Espoo, Finland');
    expect(result.isp).toBe('CAIW Internet');
  });

  it('normalizes Ookla speedtest JSON output', () => {
    const result = normalizeSpeedtestOutput(
      JSON.stringify({
        type: 'result',
        timestamp: '2026-04-26T18:00:00Z',
        ping: {
          jitter: 0.53,
          latency: 19.31,
          low: 18.71,
          high: 20.37,
        },
        download: {
          bandwidth: 11751250,
          bytes: 88900000,
        },
        upload: {
          bandwidth: 9650000,
          bytes: 68800000,
        },
        packetLoss: 0,
        isp: 'BSNL',
        server: {
          id: 16094,
          name: 'Coimbatore',
          location: 'Coimbatore',
          country: 'India',
          sponsor: 'BHARAT SANCHAR NIGAM LTD',
        },
        result: {
          url: 'https://www.speedtest.net/result/c/example',
        },
      }),
      'ookla',
      'scheduled',
      startedAt,
      finishedAt
    );

    expect(result.status).toBe('completed');
    expect(result.downloadMbps).toBeCloseTo(94.01, 2);
    expect(result.uploadMbps).toBeCloseTo(77.2, 2);
    expect(result.pingMs).toBe(19.31);
    expect(result.jitterMs).toBe(0.53);
    expect(result.serverName).toBe('BHARAT SANCHAR NIGAM LTD');
    expect(result.serverLocation).toBe('Coimbatore, India');
    expect(result.resultUrl).toBe('https://www.speedtest.net/result/c/example');
  });

  it.each([
    ['ookla' as const, { result: { url: 'javascript:alert(1)' } }],
    ['python' as const, { share: 'file:///tmp/speedtest-result' }],
  ])('omits non-web speedtest result links from %s output', (cli, output) => {
    const result = normalizeSpeedtestOutput(
      JSON.stringify({
        download: cli === 'ookla' ? { bandwidth: 100, bytes: 1 } : 100,
        upload: cli === 'ookla' ? { bandwidth: 100, bytes: 1 } : 100,
        ping: cli === 'ookla' ? { latency: 10 } : 10,
        server: { sponsor: 'Test Server', name: 'Paris', country: 'France', id: '1' },
        ...output,
      }),
      cli,
      'manual',
      startedAt,
      finishedAt
    );

    expect(result.resultUrl).toBeUndefined();
  });

  it('persists a failed result when the speedtest command is unavailable', async () => {
    vi.mocked(execFile).mockImplementation(
      (
        _file: string,
        _args: readonly string[] | null | undefined,
        _options: unknown,
        callback: ExecFileCallback
      ) => {
        if (typeof callback === 'function') {
          callback(Object.assign(new Error('spawn speedtest ENOENT'), { code: 'ENOENT' }), '', '');
        }
        return null as never;
      }
    );
    vi.mocked(NetworkSpeedtestResult.create).mockImplementation(async (doc) => doc as never);

    const result = await runNetworkSpeedtest('manual');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('speedtest command not found');
    expect(NetworkSpeedtestResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'manual',
        status: 'failed',
      })
    );
  });

  it('detects Ookla CLI and runs with JSON options', async () => {
    mockExecSequence([
      'Speedtest by Ookla is the official command line client\n  -f, --format=ARG',
      JSON.stringify({
        ping: { latency: 10, jitter: 1 },
        download: { bandwidth: 12500000, bytes: 1000 },
        upload: { bandwidth: 6250000, bytes: 1000 },
        server: { id: 1, sponsor: 'Test ISP', name: 'Paris', country: 'France' },
        result: { url: 'https://example.test/result' },
      }),
    ]);
    vi.mocked(NetworkSpeedtestResult.create).mockImplementation(async (doc) => doc as never);

    const result = await runNetworkSpeedtest('manual');

    expect(result.cli).toBe('ookla');
    expect(result.downloadMbps).toBe(100);
    expect(vi.mocked(execFile).mock.calls[1][1]).toEqual([
      '--accept-license',
      '--accept-gdpr',
      '--format=json',
      '--progress=no',
    ]);
  });

  it('detects Python speedtest-cli and runs with JSON options', async () => {
    mockExecSequence([
      'usage: speedtest [-h] [--json]',
      JSON.stringify({
        download: 100000000,
        upload: 40000000,
        ping: 12,
        server: { sponsor: 'Python Server', name: 'Rome', country: 'Italy', id: '2' },
      }),
    ]);
    vi.mocked(NetworkSpeedtestResult.create).mockImplementation(async (doc) => doc as never);

    const result = await runNetworkSpeedtest('manual');

    expect(result.cli).toBe('python');
    expect(result.downloadMbps).toBe(100);
    expect(vi.mocked(execFile).mock.calls[1][1]).toEqual(['--json', '--secure']);
  });

  it('calculates next schedule times for fixed intervals', () => {
    expect(getNextSpeedtestRunAt('off', startedAt)).toBeNull();
    expect(getNextSpeedtestRunAt('30m', startedAt)?.toISOString()).toBe('2026-04-26T17:30:00.000Z');
    expect(getNextSpeedtestRunAt('3h', startedAt)?.toISOString()).toBe('2026-04-26T20:00:00.000Z');
    expect(getNextSpeedtestRunAt('24h', startedAt)?.toISOString()).toBe('2026-04-27T17:00:00.000Z');
  });

  it('updates persisted schedule settings with the next due time', async () => {
    const settings = {
      scheduleInterval: '1h',
      nextRunAt: new Date('2026-04-26T18:00:00.000Z'),
    };
    vi.mocked(NetworkSpeedtestSettings.findByIdAndUpdate).mockReturnValue({
      lean: vi.fn().mockResolvedValue(settings),
    } as never);

    const result = await updateNetworkSpeedtestSchedule('1h', startedAt);

    expect(result.scheduleInterval).toBe('1h');
    expect(result.nextRunAt).toBe('2026-04-26T18:00:00.000Z');
    expect(NetworkSpeedtestSettings.findByIdAndUpdate).toHaveBeenCalledWith(
      'network-speedtest-settings',
      expect.objectContaining({
        scheduleInterval: '1h',
        nextRunAt: new Date('2026-04-26T18:00:00.000Z'),
      }),
      expect.objectContaining({ upsert: true, new: true })
    );
  });

  it('keeps a running speedtest from starting twice', async () => {
    mockExecSuccess(
      JSON.stringify({
        download: 100000000,
        upload: 40000000,
        ping: 12,
        server: { sponsor: 'Python Server', name: 'Rome', country: 'Italy', id: '2' },
      })
    );
    vi.mocked(NetworkSpeedtestResult.create).mockImplementation(async (doc) => doc as never);

    const first = runNetworkSpeedtest('manual');
    await expect(runNetworkSpeedtest('manual')).rejects.toThrow('Speedtest already running');
    await first;
  });
});
