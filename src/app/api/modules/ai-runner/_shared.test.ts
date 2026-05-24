import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { type JsonRequest, requireSession, parseBody, zodErrorResponse } from './_shared';
import { getSession } from '@/lib/session';

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/server', () => {
  const jsonMock = vi.fn();
  return {
  NextResponse: {
      json: jsonMock,
    },
  };
});

const createMockRequest = (jsonValue: unknown): JsonRequest => ({
  json: vi.fn().mockResolvedValue(jsonValue),
});

describe('ai-runner _shared utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireSession', () => {
    it('returns 401 response if no session exists', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);
      const unauthorizedResponse = new Response(null, { status: 401 });
      vi.mocked(NextResponse.json).mockReturnValueOnce(unauthorizedResponse);

      const response = await requireSession();

      expect(getSession).toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, { status: 401 });
      expect(response).toBe(unauthorizedResponse);
    });

    it('returns null if session exists', async () => {
      vi.mocked(getSession).mockResolvedValueOnce({ userId: '123' } as never);

      const response = await requireSession();

      expect(getSession).toHaveBeenCalled();
      expect(response).toBeNull();
    });
  });

  describe('parseBody', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    });

    it('parses valid json according to schema', async () => {
      const validData = { name: 'Alice', age: 30 };
      const req = createMockRequest(validData);

      const result = await parseBody(req, schema);
      expect(result).toEqual(validData);
    });

    it('throws ZodError on invalid json', async () => {
      const invalidData = { name: 123 }; // invalid name
      const req = createMockRequest(invalidData);

      await expect(parseBody(req, schema)).rejects.toThrow(ZodError);
    });
  });

  describe('zodErrorResponse', () => {
    it('returns 400 response for ZodError', () => {
      const schema = z.object({ name: z.string() });
      const parsed = schema.safeParse({ name: 123 });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        vi.mocked(NextResponse.json).mockReturnValueOnce({ status: 400 } as never);

        const response = zodErrorResponse(parsed.error);

        expect(NextResponse.json).toHaveBeenCalledWith(
          { error: expect.stringContaining('string') },
          { status: 400 }
        );
        expect(response).toEqual({ status: 400 });
      }
    });

    it('returns null for non-ZodError', () => {
      const error = new Error('Generic error');
      const response = zodErrorResponse(error);
      expect(response).toBeNull();
    });

    it('returns null for null error', () => {
      const response = zodErrorResponse(null);
      expect(response).toBeNull();
    });
  });
});
