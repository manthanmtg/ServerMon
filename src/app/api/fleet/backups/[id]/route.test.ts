/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockFindById, mockFindByIdAndDelete, mockFleetLogCreate } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockFindById: vi.fn(),
    mockFindByIdAndDelete: vi.fn(),
    mockFleetLogCreate: vi.fn(),
  })
);

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/audit', () => ({
  recordAudit: (_m: unknown, input: Record<string, unknown>) =>
    mockFleetLogCreate({ ...input, audit: true, eventType: input.action }),
}));

vi.mock('@/models/BackupJob', () => ({
  default: {
    findById: mockFindById,
    findByIdAndDelete: mockFindByIdAndDelete,
  },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { GET, DELETE } from './route';

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('backups [id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('GET returns 404 when missing', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(new NextRequest('http://localhost'), ctx('b1'));
    expect(res.status).toBe(404);
  });

  it('GET returns job', async () => {
    mockFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'b1', status: 'completed' }),
    });
    const res = await GET(new NextRequest('http://localhost'), ctx('b1'));
    expect(res.status).toBe(200);
  });

  it('DELETE removes and audits', async () => {
    mockFindById.mockResolvedValue({ _id: 'b1' });
    mockFindByIdAndDelete.mockResolvedValue({ _id: 'b1' });
    const res = await DELETE(new NextRequest('http://localhost'), ctx('b1'));
    expect(res.status).toBe(200);
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'backup.delete' })
    );
  });
});
