/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUpdateRunDetails } = vi.hoisted(() => ({
  mockGetUpdateRunDetails: vi.fn(),
}));

vi.mock('@/lib/updates/system-service', () => ({
  systemUpdateService: { getUpdateRunDetails: mockGetUpdateRunDetails },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/system/update/history/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns update run details', async () => {
    const details = {
      id: 'run-abc',
      status: 'completed',
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:05:00Z',
      packages: [{ name: 'bash', from: '5.1', to: '5.2' }],
    };
    mockGetUpdateRunDetails.mockResolvedValue(details);
    const res = await GET(new NextRequest('http://localhost'), makeContext('run-abc'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('run-abc');
    expect(json.status).toBe('completed');
    expect(json.packages).toHaveLength(1);
  });

  it('returns 404 when run not found', async () => {
    mockGetUpdateRunDetails.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost'), makeContext('nonexistent'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Update run not found');
  });

  it('returns 500 on service error', async () => {
    mockGetUpdateRunDetails.mockRejectedValue(new Error('db error'));
    const res = await GET(new NextRequest('http://localhost'), makeContext('run-abc'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to get update run details');
  });
});
