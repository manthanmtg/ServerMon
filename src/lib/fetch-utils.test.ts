import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resilientFetch, isAbortError, safeJson } from './fetch-utils';

describe('fetch-utils', () => {
  describe('isAbortError', () => {
    it('identifies DOMException AbortError', () => {
      expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    });

    it('rejects DOMException values with other names', () => {
      expect(isAbortError(new DOMException('Invalid JSON', 'SyntaxError'))).toBe(false);
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
      expect(isAbortError(undefined)).toBe(false);
    });

    it('returns false for plain objects that look like AbortError', () => {
      expect(isAbortError({ name: 'AbortError' })).toBe(false);
      expect(isAbortError({ message: 'AbortError' })).toBe(false);
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

    it('returns null for an empty response body', async () => {
      const res = new Response(null, { status: 204 });
      await expect(safeJson(res)).resolves.toBeNull();
    });

    it('returns JSON null as null without treating it as a parse error', async () => {
      const res = new Response('null');
      await expect(safeJson(res)).resolves.toBeNull();
    });

    it('preserves JSON primitive values', async () => {
      await expect(safeJson<boolean>(new Response('false'))).resolves.toBe(false);
      await expect(safeJson<number>(new Response('0'))).resolves.toBe(0);
      await expect(safeJson<string>(new Response('"ok"'))).resolves.toBe('ok');
    });

    it('returns null if response body was already consumed', async () => {
      const res = new Response(JSON.stringify({ a: 1 }));
      await res.text(); // Consume body
      expect(res.bodyUsed).toBe(true);
      const data = await safeJson(res);
      expect(data).toBeNull();
    });
  });

  describe('resilientFetch', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('successfully fetches data', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('ok'));
      const res = await resilientFetch('/api/test');
      expect(res.ok).toBe(true);
    });

    it('passes headers through to fetch', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('ok'));

      await resilientFetch('/api/test', {
        headers: { authorization: 'Bearer token' },
      });

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: { authorization: 'Bearer token' },
        })
      );
    });

    it('passes request options through while replacing only the signal', async () => {
      const controller = new AbortController();
      vi.mocked(fetch).mockResolvedValueOnce(new Response('ok'));

      await resilientFetch('/api/test', {
        cache: 'no-store',
        credentials: 'include',
        mode: 'same-origin',
        redirect: 'manual',
        signal: controller.signal,
      });

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          cache: 'no-store',
          credentials: 'include',
          mode: 'same-origin',
          redirect: 'manual',
          signal: expect.any(AbortSignal),
        })
      );
      expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal).not.toBe(controller.signal);
    });

    it('removes caller abort listeners after a successful request', async () => {
      const controller = new AbortController();
      const addListener = vi.spyOn(controller.signal, 'addEventListener');
      const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
      vi.mocked(fetch).mockResolvedValueOnce(new Response('ok'));

      await resilientFetch('/api/test', { signal: controller.signal });

      expect(addListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
      expect(removeListener).toHaveBeenCalledWith('abort', addListener.mock.calls[0]?.[1]);
    });

    it('removes caller abort listeners after a failed request', async () => {
      const controller = new AbortController();
      const addListener = vi.spyOn(controller.signal, 'addEventListener');
      const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      await expect(resilientFetch('/api/test', { signal: controller.signal })).rejects.toThrow(
        'Network error'
      );

      expect(addListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
      expect(removeListener).toHaveBeenCalledWith('abort', addListener.mock.calls[0]?.[1]);
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

    it('uses the last retry error when every attempt fails', async () => {
      const firstError = new Error('First failure');
      const secondError = new Error('Second failure');
      vi.mocked(fetch).mockRejectedValueOnce(firstError).mockRejectedValueOnce(secondError);

      await expect(resilientFetch('/api/test', { retries: 1, retryDelay: 1 })).rejects.toBe(
        secondError
      );
    });

    it('uses the default retry delay before a retry attempt', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response('ok'));

      const request = resilientFetch('/api/test', { retries: 1 });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      await vi.advanceTimersByTimeAsync(999);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      const res = await request;

      expect(res.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('waits for the configured retry delay before retrying', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response('ok'));

      const request = resilientFetch('/api/test', { retries: 1, retryDelay: 250 });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      await vi.advanceTimersByTimeAsync(249);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      const res = await request;

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

    it('retries after a timeout failure', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockImplementationOnce((_url: string | URL | Request, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        })
        .mockResolvedValueOnce(new Response('ok'));

      const request = resilientFetch('/api/test', { timeout: 25, retries: 1, retryDelay: 10 });
      await vi.advanceTimersByTimeAsync(25);
      await vi.advanceTimersByTimeAsync(10);

      await expect(request).resolves.toHaveProperty('ok', true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry when retries is zero', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      await expect(resilientFetch('/api/test', { retryDelay: 1 })).rejects.toThrow('Network error');
      expect(fetch).toHaveBeenCalledTimes(1);
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

    it('does not wait for the timeout after fetch rejects immediately', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const request = resilientFetch('/api/test', { timeout: 1000 });

      await expect(request).rejects.toThrow('Network error');
      expect(vi.getTimerCount()).toBe(0);
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

    it('accepts URL objects', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('ok'));
      const url = new URL('https://example.com/api/test');

      await resilientFetch(url);

      expect(fetch).toHaveBeenCalledWith(url, expect.any(Object));
    });

    it('returns non-200 HTTP responses without retrying', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

      const res = await resilientFetch('/api/404', { retries: 2, retryDelay: 1 });
      expect(res.status).toBe(404);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('retries transient server responses for safe requests', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
        .mockResolvedValueOnce(new Response('ok'));

      const res = await resilientFetch('/api/test', {
        retries: 1,
        retryDelay: 1,
        retryOnStatuses: [503],
      });

      expect(res.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry transient server responses for mutation requests', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));

      const res = await resilientFetch('/api/test', {
        method: 'POST',
        retries: 1,
        retryDelay: 1,
        retryOnStatuses: [503],
      });

      expect(res.status).toBe(503);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('retries immediately if retryDelay is 0', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response('ok'));

      const request = resilientFetch('/api/test', { retries: 1, retryDelay: 0 });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      // Should retry on next tick
      await vi.advanceTimersByTimeAsync(0);
      const res = await request;

      expect(res.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('handles concurrent requests independently', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(() => resolve(new Response('one')), 100))
        )
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(() => resolve(new Response('two')), 50))
        );

      const req1 = resilientFetch('/api/1', { timeout: 200 });
      const req2 = resilientFetch('/api/2', { timeout: 200 });

      await vi.advanceTimersByTimeAsync(50);
      const res2 = await req2;
      expect(await res2.text()).toBe('two');

      await vi.advanceTimersByTimeAsync(50);
      const res1 = await req1;
      expect(await res1.text()).toBe('one');

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('aborts during the retry delay wait if caller signal is aborted', async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const request = resilientFetch('/api/test', {
        retries: 1,
        retryDelay: 1000,
        signal: controller.signal,
      });

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      // Wait 500ms, then abort
      await vi.advanceTimersByTimeAsync(500);
      controller.abort('cancel');

      // Now it should reject immediately without waiting for the rest of the retry delay
      await expect(request).rejects.toThrow('cancel');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('handles empty options and uses defaults', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('ok'));
      const res = await resilientFetch('/api/test');
      expect(res.ok).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });
});
