/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRemoveVolume } = vi.hoisted(() => ({
  mockRemoveVolume: vi.fn(),
}));

vi.mock('@/lib/docker/service', () => ({
  dockerService: { removeVolume: mockRemoveVolume },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DELETE } from './route';

function makeContext(volumeName: string) {
  return { params: Promise.resolve({ volumeName }) };
}

describe('DELETE /api/modules/docker/volumes/[volumeName]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes a volume successfully', async () => {
    mockRemoveVolume.mockResolvedValue({ success: true });
    const res = await DELETE(new Request('http://localhost'), makeContext('my-volume'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockRemoveVolume).toHaveBeenCalledWith('my-volume');
  });

  it('passes correct volumeName to service', async () => {
    mockRemoveVolume.mockResolvedValue({ success: false });
    await DELETE(new Request('http://localhost'), makeContext('data-vol'));
    expect(mockRemoveVolume).toHaveBeenCalledWith('data-vol');
  });

  it('returns 500 on service error', async () => {
    mockRemoveVolume.mockRejectedValue(new Error('volume in use'));
    const res = await DELETE(new Request('http://localhost'), makeContext('my-volume'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to remove volume');
  });
});
