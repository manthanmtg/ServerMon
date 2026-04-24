import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { NodeHardwareCharts, toSamples } from './NodeHardwareCharts';

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="responsive">{children}</div>
  ),
}));

describe('toSamples', () => {
  it('extracts cpuLoad and ramUsed from metadata and reverses order', () => {
    const events = [
      {
        _id: 'e2',
        createdAt: '2024-01-01T12:01:00Z',
        eventType: 'metrics_sample',
        metadata: { cpuLoad: 0.7, ramUsed: 200 },
      },
      {
        _id: 'e1',
        createdAt: '2024-01-01T12:00:00Z',
        eventType: 'metrics_sample',
        metadata: { cpuLoad: 0.5, ramUsed: 100 },
      },
    ];
    const samples = toSamples(events);
    expect(samples).toHaveLength(2);
    // reversed: earliest first
    expect(samples[0].cpuLoad).toBe(0.5);
    expect(samples[0].ramUsed).toBe(100);
    expect(samples[1].cpuLoad).toBe(0.7);
  });

  it('skips events with no metrics metadata', () => {
    const events = [
      { _id: 'e1', createdAt: 'x', eventType: 'metrics_sample', metadata: {} },
      {
        _id: 'e2',
        createdAt: 'y',
        eventType: 'metrics_sample',
        metadata: { cpuLoad: 0.2 },
      },
    ];
    const samples = toSamples(events);
    expect(samples).toHaveLength(1);
    expect(samples[0].cpuLoad).toBe(0.2);
  });

  it('returns empty array when no events', () => {
    expect(toSamples([])).toEqual([]);
  });
});

describe('NodeHardwareCharts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows empty state when no metrics samples', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [], nextCursor: null }),
      })
    );

    await act(async () => {
      render(<NodeHardwareCharts nodeId="n1" />);
    });

    await waitFor(() => {
      const empties = screen.getAllByText(/No metrics yet/);
      expect(empties.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders charts when samples are present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          events: [
            {
              _id: 'e1',
              createdAt: new Date().toISOString(),
              eventType: 'metrics_sample',
              metadata: { cpuLoad: 0.3, ramUsed: 128 },
            },
          ],
          nextCursor: null,
        }),
      })
    );

    await act(async () => {
      render(<NodeHardwareCharts nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('CPU load')).toBeDefined();
      expect(screen.getByText('RAM used')).toBeDefined();
    });
    expect(screen.getAllByTestId('line-chart').length).toBe(2);
  });
});
