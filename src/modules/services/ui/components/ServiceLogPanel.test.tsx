import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceLogPanel } from './ServiceLogPanel';

describe('ServiceLogPanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        logs: [
          {
            timestamp: '2026-04-27T11:00:00.000Z',
            priority: 'info',
            message: 'Started nginx',
            unit: 'nginx.service',
          },
        ],
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and renders recent service logs', async () => {
    render(<ServiceLogPanel serviceName="nginx.service" />);

    await waitFor(() =>
      expect(screen.getByRole('log', { name: 'nginx.service service logs' })).toHaveTextContent(
        'Started nginx'
      )
    );

    expect(screen.getByRole('button', { name: 'Follow live output' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Autoscroll output' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Wrap output' })).toBeDefined();

    expect(global.fetch).toHaveBeenCalledWith('/api/modules/services/nginx.service/logs?lines=30', {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
  });

  it('shows an empty state for malformed log payloads', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logs: 'not-an-array' }),
    } as Response);

    render(<ServiceLogPanel serviceName="nginx.service" />);

    await waitFor(() => expect(screen.getByText('No logs available.')).toBeDefined());
  });

  it('ignores malformed entries in otherwise valid log payloads', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        logs: [
          { timestamp: 'not-a-date', priority: 'info', message: 'Malformed timestamp' },
          {
            timestamp: '2026-04-27T11:00:00.000Z',
            priority: 'warning',
            message: 'Restarted nginx',
            unit: 'nginx.service',
          },
          {
            timestamp: '2026-04-27T11:01:00.000Z',
            priority: 'verbose',
            message: 'Malformed priority',
            unit: 'nginx.service',
          },
        ],
      }),
    } as Response);

    render(<ServiceLogPanel serviceName="nginx.service" />);

    await waitFor(() =>
      expect(screen.getByRole('log', { name: 'nginx.service service logs' })).toHaveTextContent(
        'Restarted nginx'
      )
    );

    expect(screen.queryByText('Malformed timestamp')).toBeNull();
    expect(screen.queryByText('Malformed priority')).toBeNull();
  });

  it('offers a retry when the initial request fails', async () => {
    vi.mocked(global.fetch)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ logs: [] }),
      } as Response);

    render(<ServiceLogPanel serviceName="nginx.service" />);

    const retry = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retry);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
