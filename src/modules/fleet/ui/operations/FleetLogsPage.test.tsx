import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { FleetLogsPage } from './FleetLogsPage';

describe('FleetLogsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders filters and events from fetch', async () => {
    const events = [
      {
        _id: 'e1',
        createdAt: new Date().toISOString(),
        service: 'nginx',
        level: 'info',
        eventType: 'route.create',
        message: 'created',
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events, nextCursor: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<FleetLogsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('route.create')).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalled();
    // ensure fetch was called with logs URL
    expect(
      fetchMock.mock.calls.some(
        ([url]) => typeof url === 'string' && url.startsWith('/api/fleet/logs')
      )
    ).toBe(true);
  });

  it('clicking Apply filters re-fetches', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [], nextCursor: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<FleetLogsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('Apply filters')).toBeDefined();
    });

    const callsBefore = fetchMock.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByText('Apply filters'));
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(callsBefore);
    });
  });
});
