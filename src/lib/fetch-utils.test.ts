import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resilientFetch } from './fetch-utils';

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
    vi.mocked(fetch).mockImplementationOnce((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    await expect(resilientFetch('/api/test', { timeout: 10 })).rejects.toThrow(/timed out/);
  });

  it('retries on failure', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(new Response('ok'));

    const res = await resilientFetch('/api/test', { retries: 1, retryDelay: 10 });
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
