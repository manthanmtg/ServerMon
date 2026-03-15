/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockProcesses = vi.hoisted(() => vi.fn());
const mockCurrentLoad = vi.hoisted(() => vi.fn());
const mockMem = vi.hoisted(() => vi.fn());

vi.mock('systeminformation', () => ({
  default: {
    processes: mockProcesses,
    currentLoad: mockCurrentLoad,
    mem: mockMem,
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn().mockImplementation((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

import { GET, POST } from './route';

// ── Helpers ────────────────────────────────────────────────────────────────

const makeProc = (overrides: Record<string, unknown> = {}) => ({
  pid: 100,
  parentPid: 1,
  name: 'node',
  command: 'node server.js',
  path: '/usr/bin/node',
  user: 'root',
  state: 'running',
  cpu: 5.0,
  mem: 2.5,
  memRss: 1024,
  started: '2026-01-01',
  priority: 0,
  ...overrides,
});

const defaultSiResponse = () => ({
  processes: {
    all: 50,
    running: 3,
    sleeping: 45,
    blocked: 2,
    list: [makeProc()],
  },
  currentLoad: { currentLoad: 30.0 },
  mem: { total: 8_000_000_000, active: 2_000_000_000 },
});

const makeGetRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/modules/processes');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
};

const makePostRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/modules/processes', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('GET /api/modules/processes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { processes, currentLoad, mem } = defaultSiResponse();
    mockProcesses.mockResolvedValue(processes);
    mockCurrentLoad.mockResolvedValue(currentLoad);
    mockMem.mockResolvedValue(mem);
  });

  it('returns a list of processes and a summary', async () => {
    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.processes)).toBe(true);
    expect(body.processes).toHaveLength(1);
    expect(body.processes[0].pid).toBe(100);
    expect(body.summary).toMatchObject({
      total: 50,
      running: 3,
      sleeping: 45,
      blocked: 2,
    });
  });

  it('includes computed summary fields (cpuLoad, memPercent)', async () => {
    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(body.summary.cpuLoad).toBe(30.0);
    expect(body.summary.memPercent).toBeCloseTo(25, 0); // 2GB / 8GB * 100
  });

  it('filters processes by name when search param is provided', async () => {
    mockProcesses.mockResolvedValue({
      ...defaultSiResponse().processes,
      list: [
        makeProc({ pid: 1, name: 'nginx', command: 'nginx -g daemon off' }),
        makeProc({ pid: 2, name: 'node', command: 'node server.js' }),
      ],
    });

    const response = await GET(makeGetRequest({ search: 'nginx' }));
    const body = await response.json();

    expect(body.processes).toHaveLength(1);
    expect(body.processes[0].name).toBe('nginx');
  });

  it('filters by PID string when search matches pid', async () => {
    mockProcesses.mockResolvedValue({
      ...defaultSiResponse().processes,
      list: [makeProc({ pid: 1234, name: 'app' }), makeProc({ pid: 5678, name: 'other' })],
    });

    const response = await GET(makeGetRequest({ search: '1234' }));
    const body = await response.json();

    expect(body.processes).toHaveLength(1);
    expect(body.processes[0].pid).toBe(1234);
  });

  it('caps the limit at 200 regardless of the query param', async () => {
    mockProcesses.mockResolvedValue({
      ...defaultSiResponse().processes,
      list: Array.from({ length: 300 }, (_, i) => makeProc({ pid: i, cpu: 1 })),
    });

    const response = await GET(makeGetRequest({ limit: '9999' }));
    const body = await response.json();

    expect(body.processes.length).toBeLessThanOrEqual(200);
  });

  it('returns 500 when systeminformation throws', async () => {
    mockProcesses.mockRejectedValue(new Error('si error'));

    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  it('uses defaults for missing process fields', async () => {
    mockProcesses.mockResolvedValue({
      ...defaultSiResponse().processes,
      list: [
        {
          pid: 99,
          parentPid: 1,
          name: 'mystery',
          command: '',
          path: '',
          user: '',
          state: '',
          cpu: 0,
          mem: 0,
          memRss: 0,
          started: '',
          priority: 0,
        },
      ],
    });

    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(body.processes[0].command).toBe('mystery'); // falls back to name
    expect(body.processes[0].user).toBe('system'); // falls back to 'system'
    expect(body.processes[0].state).toBe('unknown'); // falls back to 'unknown'
  });
});

describe('POST /api/modules/processes', () => {
  it('sends SIGTERM to the specified PID', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const req = makePostRequest({ pid: 1234 });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.pid).toBe(1234);
    expect(body.signal).toBe('SIGTERM');
    expect(killSpy).toHaveBeenCalledWith(1234, 'SIGTERM');
    killSpy.mockRestore();
  });

  it('sends SIGKILL when signal is SIGKILL', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const req = makePostRequest({ pid: 5678, signal: 'SIGKILL' });
    const response = await POST(req);
    const body = await response.json();

    expect(body.signal).toBe('SIGKILL');
    expect(killSpy).toHaveBeenCalledWith(5678, 'SIGKILL');
    killSpy.mockRestore();
  });

  it('defaults to SIGTERM for any unrecognized signal value', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const req = makePostRequest({ pid: 9999, signal: 'SIGHUP' });
    const response = await POST(req);
    const body = await response.json();

    expect(body.signal).toBe('SIGTERM');
    killSpy.mockRestore();
  });

  it('returns 400 when PID is missing', async () => {
    const req = makePostRequest({ signal: 'SIGTERM' });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when PID is not a number', async () => {
    const req = makePostRequest({ pid: 'not-a-number' });
    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns 500 when process.kill throws', async () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('No such process');
    });

    const req = makePostRequest({ pid: 9999 });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('No such process');
  });
});
