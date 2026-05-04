import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resilientFetch } from './fetch-utils';

describe('resilientFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('successfully fetches data', async () => {
    (fetch as any).mockResolvedValueOnce(new Response('ok'));
    const res = await resilientFetch('/api/test');
    expect(res.ok).toBe(true);
  });

  it('times out if request takes too long', async () => {
    (fetch as any).mockImplementationOnce((_url: string, init: any) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    await expect(resilientFetch('/api/test', { timeout: 10 })).rejects.toThrow(/timed out/);
  });

  it('retries on failure', async () => {
    (fetch as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(new Response('ok'));
    
    const res = await resilientFetch('/api/test', { retries: 1, retryDelay: 10 });
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
