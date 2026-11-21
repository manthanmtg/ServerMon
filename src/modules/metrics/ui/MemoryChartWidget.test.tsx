import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { metricsState } = vi.hoisted(() => ({
  metricsState: { history: [] as Array<{ cpu: number; memory: number; timestamp: string }> },
}));

vi.mock('@/lib/MetricsContext', () => ({
  useMetrics: () => ({ history: metricsState.history, latest: null, connected: false }),
}));

vi.mock('recharts', () => ({
  AreaChart: ({ children, data }: { children: React.ReactNode; data: unknown }) => (
    <svg data-testid="area-chart" data-chart={JSON.stringify(data)}>
      {children}
    </svg>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import MemoryChartWidget from './MemoryChartWidget';

describe('MemoryChartWidget', () => {
  beforeEach(() => {
    metricsState.history = [];
  });

  it('shows a waiting message while shared metrics history is empty', async () => {
    await act(async () => render(<MemoryChartWidget />));
    expect(screen.getByText('Waiting for data...')).toBeDefined();
  });

  it('renders external memory data', async () => {
    await act(async () =>
      render(
        <MemoryChartWidget
          externalData={[
            { memory: 60, timestamp: '12:00:00' },
            { memory: 75, timestamp: '12:00:05' },
          ]}
        />
      )
    );
    expect(screen.getByTestId('area-chart')).toBeDefined();
  });

  it('consumes and bounds validated shared memory history', async () => {
    metricsState.history = Array.from({ length: 35 }, (_, index) => ({
      cpu: 0,
      memory: index === 34 ? -5 : index * 2,
      timestamp: `t${index}`,
    }));

    await act(async () => render(<MemoryChartWidget />));

    const data = JSON.parse(screen.getByTestId('area-chart').getAttribute('data-chart') ?? '[]');
    expect(data).toHaveLength(30);
    expect(data.at(-1)).toEqual({ memory: 0, timestamp: 't34' });
  });

  it('keeps an explicitly empty external series empty', async () => {
    metricsState.history = [{ cpu: 10, memory: 20, timestamp: 'shared' }];
    await act(async () => render(<MemoryChartWidget externalData={[]} />));
    expect(screen.getByText('Waiting for data...')).toBeDefined();
  });
});
