import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import EndpointsWidget, { deriveEndpointWidgetSummary } from './EndpointsWidget';
import type { CustomEndpointDTO } from '../types';

const mockEndpoints: CustomEndpointDTO[] = [
  {
    _id: 'ep-1',
    name: 'Get Users',
    slug: 'get-users',
    method: 'GET',
    endpointType: 'script',
    enabled: true,
    auth: 'public',
    tokens: [],
    tags: [],
    timeout: 30000,
    executionCount: 150,
    lastStatus: 200,
    lastExecutedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    createdAt: '2026-04-26T10:00:00.000Z',
    updatedAt: '2026-04-26T10:00:00.000Z',
  },
  {
    _id: 'ep-2',
    name: 'Create Item',
    slug: 'create-item',
    method: 'POST',
    endpointType: 'script',
    enabled: true,
    auth: 'token',
    tokens: [],
    tags: [],
    timeout: 30000,
    executionCount: 75,
    lastStatus: 201,
    lastExecutedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: '2026-04-26T10:00:00.000Z',
    updatedAt: '2026-04-26T10:00:00.000Z',
  },
  {
    _id: 'ep-3',
    name: 'Delete Record',
    slug: 'delete-record',
    method: 'DELETE',
    endpointType: 'script',
    enabled: false,
    auth: 'token',
    tokens: [],
    tags: [],
    timeout: 30000,
    executionCount: 10,
    lastStatus: 500,
    createdAt: '2026-04-26T10:00:00.000Z',
    updatedAt: '2026-04-26T10:00:00.000Z',
  },
];

describe('EndpointsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ endpoints: mockEndpoints, total: 3 }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading spinner initially', () => {
    let resolveFetch!: (v: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        })
    );
    render(<EndpointsWidget />);
    expect(document.querySelector('.animate-spin')).toBeTruthy();
    act(() => {
      resolveFetch({
        ok: true,
        json: async () => ({ endpoints: mockEndpoints, total: 3 }),
      } as Response);
    });
  });

  it('renders Endpoints title after load', async () => {
    await act(async () => {
      render(<EndpointsWidget />);
    });
    await waitFor(() => expect(screen.getByText('Endpoints')).toBeDefined());
  });

  it('shows active/total badge', async () => {
    await act(async () => {
      render(<EndpointsWidget />);
    });
    // 2 enabled out of 3 total
    await waitFor(() => expect(screen.getByText('2/3 active')).toBeDefined());
  });

  it('renders summary stats', async () => {
    await act(async () => {
      render(<EndpointsWidget />);
    });
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeDefined();
      expect(screen.getByText('Errored')).toBeDefined();
      expect(screen.getByText('Total Hits')).toBeDefined();
    });
  });

  it('shows top endpoints by execution count', async () => {
    await act(async () => {
      render(<EndpointsWidget />);
    });
    await waitFor(() => {
      expect(screen.getByText('Get Users')).toBeDefined();
      expect(screen.getByText('Create Item')).toBeDefined();
    });
  });

  it('shows method labels', async () => {
    await act(async () => {
      render(<EndpointsWidget />);
    });
    await waitFor(() => {
      expect(screen.getByText('GET')).toBeDefined();
      expect(screen.getByText('POST')).toBeDefined();
    });
  });

  it('shows relative time for last executed', async () => {
    await act(async () => {
      render(<EndpointsWidget />);
    });
    await waitFor(() => {
      // "5m ago" or similar
      expect(screen.getByText('5m ago')).toBeDefined();
    });
  });

  it('shows empty state when no endpoints', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ endpoints: [], total: 0 }),
    });
    await act(async () => {
      render(<EndpointsWidget />);
    });
    await waitFor(() => expect(screen.getByText('No endpoints configured yet')).toBeDefined());
  });

  it('handles fetch failure gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<EndpointsWidget />);
    });
    // Should render without crashing after initial load
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('polls every 30 seconds', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<EndpointsWidget />);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(30001);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('deriveEndpointWidgetSummary', () => {
  it('summarizes endpoints without mutating their display order', () => {
    const endpoints = [
      { ...mockEndpoints[0], executionCount: 5 },
      { ...mockEndpoints[1], executionCount: 25 },
      { ...mockEndpoints[2], executionCount: 15 },
      {
        ...mockEndpoints[0],
        _id: 'ep-4',
        name: 'Ping',
        slug: 'ping',
        executionCount: 35,
        lastStatus: 404,
      },
    ];

    const summary = deriveEndpointWidgetSummary(endpoints);

    expect(summary).toEqual({
      total: 4,
      active: 3,
      errored: 2,
      totalHits: 80,
      topEndpoints: [
        expect.objectContaining({ _id: 'ep-4', executionCount: 35 }),
        expect.objectContaining({ _id: 'ep-2', executionCount: 25 }),
        expect.objectContaining({ _id: 'ep-3', executionCount: 15 }),
      ],
    });
    expect(endpoints.map((endpoint) => endpoint._id)).toEqual(['ep-1', 'ep-2', 'ep-3', 'ep-4']);
  });
});
