import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import { getSession } from '@/lib/session';
import { deriveNodeStatus } from '@/lib/fleet/status';

// Mock dependencies
vi.mock('@/lib/db', () => ({ default: vi.fn() }));
vi.mock('@/models/Node', () => ({
  default: {
    findOne: vi.fn(),
  },
}));
vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/lib/fleet/status', () => ({
  deriveNodeStatus: vi.fn(),
}));

describe('GET /api/fleet/nodes/by-slug/[slug]', () => {
  let mockRequest: NextRequest;

  beforeEach(() => {
    vi.resetAllMocks();
    mockRequest = new NextRequest('http://localhost:3000/api/fleet/nodes/by-slug/test-node');
  });

  it('should return 401 if unauthorized', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const response = await GET(mockRequest, { params: Promise.resolve({ slug: 'test-node' }) });
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json).toEqual({ error: 'Unauthorized' });
  });

  it('should return 404 if node not found', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { username: 'admin', role: 'admin' } });

    const mockFindOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    vi.mocked(Node.findOne).mockImplementation(mockFindOne as unknown as typeof Node.findOne);

    const response = await GET(mockRequest, { params: Promise.resolve({ slug: 'test-node' }) });
    expect(response.status).toBe(404);

    const json = await response.json();
    expect(json).toEqual({ error: 'Node not found' });
  });

  it('should return 500 on database error', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    vi.mocked(connectDB).mockRejectedValue(new Error('DB Error'));

    const response = await GET(mockRequest, { params: Promise.resolve({ slug: 'test-node' }) });
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json).toEqual({ error: 'Failed to fetch node' });
  });

  it('should return node details successfully', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    vi.mocked(connectDB).mockResolvedValue(undefined as never);

    const mockNode = {
      _id: '123',
      name: 'Test Node',
      slug: 'test-node',
      lastSeen: new Date(),
      tunnelStatus: 'active',
      status: 'online',
      maintenance: { enabled: false },
      pairingVerifiedAt: new Date(),
    };

    const mockFindOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockNode) });
    vi.mocked(Node.findOne).mockImplementation(mockFindOne as unknown as typeof Node.findOne);

    vi.mocked(deriveNodeStatus).mockReturnValue('online');

    const response = await GET(mockRequest, { params: Promise.resolve({ slug: 'test-node' }) });
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toEqual({
      _id: '123',
      name: 'Test Node',
      slug: 'test-node',
      status: 'online',
    });

    expect(deriveNodeStatus).toHaveBeenCalled();
  });
});
