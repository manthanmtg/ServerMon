import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSharedJsonPollingQuery } from './useSharedJsonPollingQuery';

function Probe({ name }: { name: string }) {
  const { data } = useSharedJsonPollingQuery<{ value: number }>({
    key: 'json:probe',
    url: '/api/probe',
    intervalMs: 60_000,
  });
  return <span data-testid={name}>{data?.value}</span>;
}

describe('useSharedJsonPollingQuery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shares a stable URL fetcher between consumers', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: 9 }),
    });
    vi.stubGlobal('fetch', fetcher);

    const view = render(
      <>
        <Probe name="first" />
        <Probe name="second" />
      </>
    );

    await waitFor(() => expect(screen.getByTestId('first')).toHaveTextContent('9'));
    expect(screen.getByTestId('second')).toHaveTextContent('9');
    expect(fetcher).toHaveBeenCalledOnce();
    view.unmount();
  });
});
