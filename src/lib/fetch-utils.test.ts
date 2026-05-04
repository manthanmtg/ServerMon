import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resilientFetch, isAbortError, safeJson } from './fetch-utils';

describe('fetch-utils', () => {
  describe('isAbortError', () => {
    it('identifies DOMException AbortError', () => {
      expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    });

    it('identifies Error with name AbortError', () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      expect(isAbortError(err)).toBe(true);
    });

    it('identifies Error with message AbortError', () => {
      expect(isAbortError(new Error('AbortError'))).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isAbortError(new Error('Network error'))).toBe(false);
      expect(isAbortError('not an error')).toBe(false);
      expect(isAbortError(null)).toBe(false);
    });
  });

  describe('safeJson', () => {
    it('parses valid JSON', async () => {
      const res = new Response(JSON.stringify({ key: 'value' }));
      const data = await safeJson<{ key: string }>(res);
      expect(data).toEqual({ key: 'value' });
    });

    it('returns null for invalid JSON', async () => {
      const res = new Response('not json');
      const data = await safeJson(res);
      expect(data).toBeNull();
    });

    it('returns null when json() fails', async () => {
      const res = {
        json: () => Promise.reject(new Error('Parse error')),
      } as Response;
      const data = await safeJson(res);
      expect(data).toBeNull();
    });
  });

  describe('resilientFetch', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    it('successfully fetches data', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('ok'));
      const res = await resilientFetch('/api/test');
      expect(res.ok).toBe(true);
    });

    it('times out if request takes too long', async () => {
      vi.mocked(fetch).mockImplementationOnce(
        (_url: string | URL | Request, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        }
      );
      await expect(resilientFetch('/api/test', { timeout: 10 })).rejects.toThrow(/timed out/);
    });

    it('propagates caller abort signals to the in-flight request', async () => {
      const controller = new AbortController();
      vi.mocked(fetch).mockImplementationOnce(
        (_url: string | URL | Request, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        }
      );

      const request = resilientFetch('/api/test', {
        signal: controller.signal,
        timeout: 1000,
      });

      controller.abort();

      await expect(request).rejects.toThrow(/Aborted/);
    });

    it('retries on failure', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response('ok'));

      const res = await resilientFetch('/api/test', { retries: 1, retryDelay: 10 });
      expect(res.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('eventually fails if all retries fail', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Persistent failure'));

      await expect(resilientFetch('/api/test', { retries: 2, retryDelay: 5 })).rejects.toThrow(
        'Persistent failure'
      );
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('respects already aborted signals', async () => {
      const controller = new AbortController();
      controller.abort('Already done');

      vi.mocked(fetch).mockImplementationOnce((_url, init) => {
        if (init?.signal?.aborted) {
          return Promise.reject(new DOMException('Aborted', 'AbortError'));
        }
        return Promise.resolve(new Response('ok'));
      });

      await expect(resilientFetch('/api/test', { signal: controller.signal })).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('handles different HTTP methods and bodies', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('ok'));
      await resilientFetch('/api/test', {
        method: 'POST',
        body: JSON.stringify({ data: 1 }),
      });

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: 1 }),
        })
      );
    });

    it('works with Request object', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('ok'));
      const req = new Request('https://example.com');
      await resilientFetch(req);
      expect(fetch).toHaveBeenCalledWith(req, expect.any(Object));
    });
  });
});
