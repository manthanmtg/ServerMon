/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPerformAction } = vi.hoisted(() => ({
  mockPerformAction: vi.fn(),
}));

vi.mock('@/lib/docker/service', () => ({
  dockerService: { performAction: mockPerformAction },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

function makeContext(containerId: string) {
  return { params: Promise.resolve({ containerId }) };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/modules/docker/[containerId]/action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('performs start action', async () => {
    mockPerformAction.mockResolvedValue({ success: true });
    const res = await POST(makeRequest({ action: 'start' }), makeContext('abc123'));
    expect(res.status).toBe(200);
    expect(mockPerformAction).toHaveBeenCalledWith('abc123', 'start');
  });

  it('performs stop action', async () => {
    mockPerformAction.mockResolvedValue({ success: true });
    const res = await POST(makeRequest({ action: 'stop' }), makeContext('abc123'));
    expect(res.status).toBe(200);
    expect(mockPerformAction).toHaveBeenCalledWith('abc123', 'stop');
  });

  it('performs restart action', async () => {
    mockPerformAction.mockResolvedValue({ success: true });
    const res = await POST(makeRequest({ action: 'restart' }), makeContext('abc123'));
    expect(res.status).toBe(200);
  });

  it('performs remove action', async () => {
    mockPerformAction.mockResolvedValue({ success: true });
    const res = await POST(makeRequest({ action: 'remove' }), makeContext('abc123'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid action', async () => {
    const res = await POST(makeRequest({ action: 'kill' }), makeContext('abc123'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid action payload');
  });

  it('returns 400 for missing action', async () => {
    const res = await POST(makeRequest({}), makeContext('abc123'));
    expect(res.status).toBe(400);
  });

  it('returns 500 on service error', async () => {
    mockPerformAction.mockRejectedValue(new Error('docker error'));
    const res = await POST(makeRequest({ action: 'start' }), makeContext('abc123'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to execute action');
  });
});
