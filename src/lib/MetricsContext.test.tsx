import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetricsProvider, useMetrics, SystemMetric } from './MetricsContext';

// ── EventSource mock ──────────────────────────────────────────────────────────

type ESMessageListener = (event: MessageEvent) => void;
type ESErrorListener = (event: Event) => void;

interface MockESInstance {
  onmessage: ESMessageListener | null;
  onerror: ESErrorListener | null;
  url: string;
  close: ReturnType<typeof vi.fn>;
}

let latestESInstance: MockESInstance | null = null;

function makeFakeEventSource(url: string): MockESInstance {
  const instance: MockESInstance = {
    url,
    onmessage: null,
    onerror: null,
    close: vi.fn(),
  };
  latestESInstance = instance;
  return instance;
}

// Vitest mock functions can be invoked with `new` and return a plain object
const FakeEventSource = vi.fn().mockImplementation(makeFakeEventSource);

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeMetric = (cpu = 10, memory = 20): SystemMetric => ({
  timestamp: new Date().toISOString(),
  serverTimestamp: new Date().toISOString(),
  cpu,
  memory,
  cpuCores: 4,
  memTotal: 8_000_000_000,
  memUsed: 1_600_000_000,
  uptime: 3600,
  swapTotal: 0,
  swapUsed: 0,
  swapFree: 0,
  disks: [],
  io: null,
});

const MetricsDisplay = () => {
  const { latest, history, connected } = useMetrics();
  return (
    <div>
      <span data-testid="connected">{connected ? 'yes' : 'no'}</span>
      <span data-testid="cpu">{latest?.cpu ?? 'null'}</span>
      <span data-testid="history-len">{history.length}</span>
    </div>
  );
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MetricsContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    latestESInstance = null;
    FakeEventSource.mockClear();
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts with no metrics and disconnected state', () => {
    render(
      <MetricsProvider>
        <MetricsDisplay />
      </MetricsProvider>
    );

    expect(screen.getByTestId('connected').textContent).toBe('no');
    expect(screen.getByTestId('cpu').textContent).toBe('null');
    expect(screen.getByTestId('history-len').textContent).toBe('0');
  });

  it('creates an EventSource pointing to /api/metrics/stream', () => {
    render(
      <MetricsProvider>
        <MetricsDisplay />
      </MetricsProvider>
    );

    expect(latestESInstance).not.toBeNull();
    expect(latestESInstance!.url).toBe('/api/metrics/stream');
  });

  it('updates latest and marks connected when a valid metric is received', async () => {
    render(
      <MetricsProvider>
        <MetricsDisplay />
      </MetricsProvider>
    );

    const metric = makeMetric(42, 55);

    await act(async () => {
      latestESInstance!.onmessage!({ data: JSON.stringify(metric) } as MessageEvent);
    });

    expect(screen.getByTestId('connected').textContent).toBe('yes');
    expect(screen.getByTestId('cpu').textContent).toBe('42');
    expect(screen.getByTestId('history-len').textContent).toBe('1');
  });

  it('accumulates history up to MAX_HISTORY (60) entries', async () => {
    render(
      <MetricsProvider>
        <MetricsDisplay />
      </MetricsProvider>
    );

    await act(async () => {
      for (let i = 0; i < 65; i++) {
        latestESInstance!.onmessage!({ data: JSON.stringify(makeMetric(i, i)) } as MessageEvent);
      }
    });

    expect(Number(screen.getByTestId('history-len').textContent)).toBe(60);
  });

  it('ignores malformed JSON without crashing', async () => {
    render(
      <MetricsProvider>
        <MetricsDisplay />
      </MetricsProvider>
    );

    await act(async () => {
      latestESInstance!.onmessage!({ data: '{{not valid json}}' } as MessageEvent);
    });

    expect(screen.getByTestId('cpu').textContent).toBe('null');
    expect(screen.getByTestId('connected').textContent).toBe('no');
  });

  it('sets connected to false on error', async () => {
    render(
      <MetricsProvider>
        <MetricsDisplay />
      </MetricsProvider>
    );

    // Receive a metric first so connected=true
    await act(async () => {
      latestESInstance!.onmessage!({ data: JSON.stringify(makeMetric()) } as MessageEvent);
    });
    expect(screen.getByTestId('connected').textContent).toBe('yes');

    const originalES = latestESInstance!;

    await act(async () => {
      latestESInstance!.onerror!(new Event('error'));
    });

    expect(screen.getByTestId('connected').textContent).toBe('no');
    expect(originalES.close).toHaveBeenCalled();
  });

  it('reconnects after RECONNECT_MS on error', async () => {
    render(
      <MetricsProvider>
        <MetricsDisplay />
      </MetricsProvider>
    );

    const firstES = latestESInstance!;

    await act(async () => {
      firstES.onerror!(new Event('error'));
    });

    await act(async () => {
      vi.advanceTimersByTime(3100);
    });

    // A new EventSource instance should have been created
    expect(latestESInstance).not.toBe(firstES);
  });

  it('does not reconnect after unmount', async () => {
    const { unmount } = render(
      <MetricsProvider>
        <MetricsDisplay />
      </MetricsProvider>
    );

    const firstES = latestESInstance!;

    await act(async () => {
      firstES.onerror!(new Event('error'));
    });

    const esAfterError = latestESInstance;
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(latestESInstance).toBe(esAfterError);
  });

  it('useMetrics returns default context values when used without a provider', () => {
    const Probe = () => {
      const ctx = useMetrics();
      return (
        <div>
          <span data-testid="has-latest">{ctx.latest === null ? 'null' : 'has'}</span>
          <span data-testid="is-connected">{String(ctx.connected)}</span>
        </div>
      );
    };

    render(<Probe />);

    expect(screen.getByTestId('has-latest').textContent).toBe('null');
    expect(screen.getByTestId('is-connected').textContent).toBe('false');
  });
});
