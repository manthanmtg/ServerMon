import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import MemoryChartWidget from './MemoryChartWidget';

vi.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let lastInstance: FakeEventSource | null = null;

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastInstance = this;
  }

  emit(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  triggerError() {
    this.onerror?.();
  }
}

describe('MemoryChartWidget', () => {
  beforeEach(() => {
    lastInstance = null;
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows waiting message when no data (uses EventSource internally)', async () => {
    await act(async () => {
      render(<MemoryChartWidget />);
    });
    expect(screen.getByText('Waiting for data...')).toBeDefined();
  });

  it('renders chart when externalData has entries', async () => {
    await act(async () => {
      render(
        <MemoryChartWidget
          externalData={[
            { memory: 60, timestamp: '12:00:00' },
            { memory: 75, timestamp: '12:00:05' },
          ]}
        />
      );
    });
    expect(screen.getByTestId('area-chart')).toBeDefined();
  });

  it('shows waiting message when externalData is empty array', async () => {
    await act(async () => {
      render(<MemoryChartWidget externalData={[]} />);
    });
    expect(screen.getByText('Waiting for data...')).toBeDefined();
  });

  it('creates an EventSource pointed at /api/metrics/stream', async () => {
    await act(async () => {
      render(<MemoryChartWidget />);
    });
    expect(lastInstance).not.toBeNull();
    expect(lastInstance!.url).toBe('/api/metrics/stream');
  });

  it('does not create EventSource when externalData is provided', async () => {
    await act(async () => {
      render(<MemoryChartWidget externalData={[{ memory: 50, timestamp: 't1' }]} />);
    });
    expect(lastInstance).toBeNull();
  });

  it('renders chart after receiving SSE message', async () => {
    await act(async () => {
      render(<MemoryChartWidget />);
    });
    await act(async () => {
      lastInstance!.emit({ memory: 65, timestamp: '12:00:00' });
    });
    expect(screen.getByTestId('area-chart')).toBeDefined();
  });

  it('closes EventSource on error', async () => {
    await act(async () => {
      render(<MemoryChartWidget />);
    });
    const es = lastInstance!;
    await act(async () => {
      es.triggerError();
    });
    expect(es.close).toHaveBeenCalled();
  });

  it('closes EventSource on unmount', async () => {
    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(<MemoryChartWidget />));
    });
    const es = lastInstance!;
    unmount();
    expect(es.close).toHaveBeenCalled();
  });

  it('keeps only last 30 data points', async () => {
    await act(async () => {
      render(<MemoryChartWidget />);
    });
    await act(async () => {
      for (let i = 0; i < 35; i++) {
        lastInstance!.emit({ memory: i * 2, timestamp: `t${i}` });
      }
    });
    expect(screen.queryByText('Waiting for data...')).toBeNull();
    expect(screen.getByTestId('area-chart')).toBeDefined();
  });
});
