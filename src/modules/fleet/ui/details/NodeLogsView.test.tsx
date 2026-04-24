import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { NodeLogsView } from './NodeLogsView';

const mockEvents = [
  {
    _id: 'e1',
    createdAt: new Date('2024-01-01T12:00:00Z').toISOString(),
    service: 'frpc',
    level: 'info',
    eventType: 'proxy_registered',
    message: 'Proxy registered successfully',
  },
  {
    _id: 'e2',
    createdAt: new Date('2024-01-01T12:01:00Z').toISOString(),
    service: 'nginx',
    level: 'error',
    eventType: 'reload_failed',
    message: 'nginx reload failed',
  },
];

describe('NodeLogsView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows spinner then renders log rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: mockEvents, nextCursor: null }),
      })
    );

    await act(async () => {
      render(<NodeLogsView nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('proxy_registered')).toBeDefined();
    });
    expect(screen.getByText('reload_failed')).toBeDefined();
    expect(screen.getByText('Proxy registered successfully')).toBeDefined();
    expect(screen.getByText('nginx reload failed')).toBeDefined();
    // service names also appear in the service dropdown (as <option>),
    // so expect at least one occurrence of each
    expect(screen.getAllByText('frpc').length).toBeGreaterThan(0);
    expect(screen.getAllByText('nginx').length).toBeGreaterThan(0);
  });

  it('shows empty state when no events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [], nextCursor: null }),
      })
    );

    await act(async () => {
      render(<NodeLogsView nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/No log events/)).toBeDefined();
    });
  });

  it('applies level and service filters to fetch URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [], nextCursor: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<NodeLogsView nodeId="n1" />);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    fetchMock.mockClear();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Filter level'), {
        target: { value: 'error' },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Filter service'), {
        target: { value: 'nginx' },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Filter event type'), {
        target: { value: 'reload' },
      });
    });

    await waitFor(() => {
      const calledWith = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .find(
          (u) =>
            u.includes('level=error') &&
            u.includes('service=nginx') &&
            u.includes('eventType=reload')
        );
      expect(calledWith).toBeDefined();
    });
  });
});
