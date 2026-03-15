/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPerformAction } = vi.hoisted(() => ({
  mockPerformAction: vi.fn(),
}));

vi.mock('@/lib/services/service', () => ({
  servicesService: { performAction: mockPerformAction },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

function makeContext(serviceName: string) {
  return { params: Promise.resolve({ serviceName }) };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/modules/services/[serviceName]/action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('performs start action successfully', async () => {
    mockPerformAction.mockResolvedValue({ success: true, message: 'Started' });
    const res = await POST(makeRequest({ action: 'start' }), makeContext('nginx'));
    expect(res.status).toBe(200);
    expect(mockPerformAction).toHaveBeenCalledWith('nginx', 'start');
  });

  it('performs stop action', async () => {
    mockPerformAction.mockResolvedValue({ success: true, message: 'Stopped' });
    const res = await POST(makeRequest({ action: 'stop' }), makeContext('apache2'));
    expect(res.status).toBe(200);
  });

  it('performs restart action', async () => {
    mockPerformAction.mockResolvedValue({ success: true, message: 'Restarted' });
    const res = await POST(makeRequest({ action: 'restart' }), makeContext('ssh'));
    expect(res.status).toBe(200);
  });

  it('performs enable action', async () => {
    mockPerformAction.mockResolvedValue({ success: true, message: 'Enabled' });
    const res = await POST(makeRequest({ action: 'enable' }), makeContext('ssh'));
    expect(res.status).toBe(200);
  });

  it('performs disable action', async () => {
    mockPerformAction.mockResolvedValue({ success: true, message: 'Disabled' });
    const res = await POST(makeRequest({ action: 'disable' }), makeContext('ssh'));
    expect(res.status).toBe(200);
  });

  it('performs reload action', async () => {
    mockPerformAction.mockResolvedValue({ success: true, message: 'Reloaded' });
    const res = await POST(makeRequest({ action: 'reload' }), makeContext('nginx'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid action', async () => {
    const res = await POST(makeRequest({ action: 'delete' }), makeContext('nginx'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid action payload');
  });

  it('returns 500 when action fails', async () => {
    mockPerformAction.mockResolvedValue({ success: false, message: 'Unit not found' });
    const res = await POST(makeRequest({ action: 'start' }), makeContext('fake'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Unit not found');
  });

  it('returns 500 on service throw', async () => {
    mockPerformAction.mockRejectedValue(new Error('systemctl error'));
    const res = await POST(makeRequest({ action: 'start' }), makeContext('nginx'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to execute action');
  });
});
