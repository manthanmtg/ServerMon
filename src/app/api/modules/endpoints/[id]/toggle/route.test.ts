/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFindById } = vi.hoisted(() => ({
  mockFindById: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/CustomEndpoint', () => ({
  default: { findById: mockFindById },
}));

import { PATCH } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/modules/endpoints/[id]/toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles enabled to false when currently true', async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    mockFindById.mockResolvedValue({
      _id: 'ep-1',
      slug: 'my-endpoint',
      enabled: true,
      save: mockSave,
    });

    const res = await PATCH(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.enabled).toBe(false);
    expect(mockSave).toHaveBeenCalled();
  });

  it('toggles enabled to true when currently false', async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    mockFindById.mockResolvedValue({
      _id: 'ep-1',
      slug: 'my-endpoint',
      enabled: false,
      save: mockSave,
    });

    const res = await PATCH(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.enabled).toBe(true);
  });

  it('returns 404 when endpoint not found', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await PATCH(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Endpoint not found');
  });

  it('returns 500 on db error', async () => {
    mockFindById.mockRejectedValue(new Error('db error'));
    const res = await PATCH(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to toggle endpoint');
  });
});
