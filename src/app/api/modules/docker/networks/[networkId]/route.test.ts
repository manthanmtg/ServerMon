/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRemoveNetwork } = vi.hoisted(() => ({
  mockRemoveNetwork: vi.fn(),
}));

vi.mock('@/lib/docker/service', () => ({
  dockerService: { removeNetwork: mockRemoveNetwork },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DELETE } from './route';

function makeContext(networkId: string) {
  return { params: Promise.resolve({ networkId }) };
}

describe('DELETE /api/modules/docker/networks/[networkId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes a network successfully', async () => {
    mockRemoveNetwork.mockResolvedValue({ success: true });
    const res = await DELETE(new Request('http://localhost'), makeContext('net123'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockRemoveNetwork).toHaveBeenCalledWith('net123');
  });

  it('passes correct networkId to service', async () => {
    mockRemoveNetwork.mockResolvedValue({ success: true });
    await DELETE(new Request('http://localhost'), makeContext('bridge-net'));
    expect(mockRemoveNetwork).toHaveBeenCalledWith('bridge-net');
  });

  it('returns 500 on service error', async () => {
    mockRemoveNetwork.mockRejectedValue(new Error('network active'));
    const res = await DELETE(new Request('http://localhost'), makeContext('net123'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to remove network');
  });
});
