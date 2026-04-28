import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EnvVarsWidget from './EnvVarsWidget';

describe('EnvVarsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        platform: 'linux',
        persistent: [{ key: 'OPENAI_API_KEY', sensitive: true }],
        session: [{ key: 'PATH' }, { key: 'HOME' }],
        skipped: [],
        target: { userFile: '/home/app/.profile' },
      }),
    } as Response);
  });

  it('renders environment variable counts', async () => {
    render(<EnvVarsWidget />);

    await waitFor(() => expect(screen.getByText('EnvVars')).toBeTruthy());
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByText('Env command')).toBeTruthy();
    expect(screen.getByText('/home/app/.profile')).toBeTruthy();
  });

  it('stops loading when the env vars request times out', async () => {
    let requestSignal: AbortSignal | undefined;
    const realSetTimeout = globalThis.setTimeout.bind(globalThis);
    const timeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation((handler, timeout) => {
      if (timeout === 8000 && typeof handler === 'function') {
        return realSetTimeout(handler, 0);
      }

      return realSetTimeout(handler, timeout);
    });

    global.fetch = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;

      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => {
          reject(new DOMException('Request aborted', 'AbortError'));
        });
      });
    });

    try {
      render(<EnvVarsWidget />);

      await waitFor(() => expect(requestSignal).toBeDefined());
      await waitFor(() => expect(requestSignal?.aborted).toBe(true));
      await waitFor(() => expect(screen.getByText('unknown')).toBeTruthy());
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
