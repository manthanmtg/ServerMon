/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockUpdateDatabase, mockDeleteDatabase } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockUpdateDatabase: vi.fn(),
  mockDeleteDatabase: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/databases/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/databases/service')>();
  return {
    ...actual,
    updateManagedDatabase: mockUpdateDatabase,
    deleteManagedDatabase: mockDeleteDatabase,
  };
});
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { PATCH, DELETE } from './route';

function makeRequest(method: 'PATCH' | 'DELETE', body?: unknown): Request {
  return new Request('http://localhost/api/modules/databases/db-1', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const validPayload = {
  name: 'New Name',
  templateId: 'postgres',
  version: '17',
  port: 5432,
  username: 'servermon',
  password: 'pg-pass-1',
  databaseName: 'servermon',
  publicRoute: false,
  sslMode: 'disable',
};

describe('/api/modules/databases/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PATCH', () => {
    it('requires admin access to update a database', async () => {
      mockGetSession.mockResolvedValue(null);

      const res = await PATCH(makeRequest('PATCH', validPayload), {
        params: Promise.resolve({ id: 'db-1' }),
      });

      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid payload', async () => {
      mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

      const res = await PATCH(makeRequest('PATCH', { port: -1 }), {
        params: Promise.resolve({ id: 'db-1' }),
      });

      expect(res.status).toBe(400);
      expect(mockUpdateDatabase).not.toHaveBeenCalled();
    });

    it('returns 500 when service throws an error', async () => {
      mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
      mockUpdateDatabase.mockRejectedValue(new Error('Internal failure'));

      const res = await PATCH(makeRequest('PATCH', validPayload), {
        params: Promise.resolve({ id: 'db-1' }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json).toEqual({ error: 'Internal failure' });
    });

    it('updates a database for valid admin requests', async () => {
      mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
      mockUpdateDatabase.mockResolvedValue({ id: 'db-1', name: 'New Name' });

      const res = await PATCH(makeRequest('PATCH', validPayload), {
        params: Promise.resolve({ id: 'db-1' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ database: { id: 'db-1', name: 'New Name' } });
      expect(mockUpdateDatabase).toHaveBeenCalledWith(
        'db-1',
        expect.objectContaining(validPayload)
      );
    });
  });

  describe('DELETE', () => {
    it('requires admin access to delete a database', async () => {
      mockGetSession.mockResolvedValue(null);

      const res = await DELETE(makeRequest('DELETE'), {
        params: Promise.resolve({ id: 'db-1' }),
      });

      expect(res.status).toBe(401);
    });

    it('returns 500 when service throws an error on deletion', async () => {
      mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
      mockDeleteDatabase.mockRejectedValue(new Error('Deletion failed'));

      const res = await DELETE(makeRequest('DELETE'), {
        params: Promise.resolve({ id: 'db-1' }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json).toEqual({ error: 'Deletion failed' });
    });

    it('deletes a database for admin requests', async () => {
      mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
      mockDeleteDatabase.mockResolvedValue({ success: true });

      const res = await DELETE(makeRequest('DELETE'), {
        params: Promise.resolve({ id: 'db-1' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ deletion: { success: true } });
      expect(mockDeleteDatabase).toHaveBeenCalledWith('db-1');
    });
  });
});
