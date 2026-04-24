import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MemoryWidget from './MemoryWidget';

vi.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => <svg data-testid="area-chart">{children}</svg>,
  Area: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Use vi.hoisted so mockMetrics is available when vi.mock factory runs
const { mockMetrics } = vi.hoisted(() => ({
  mockMetrics: {
    latest: null as {
      cpu: number;
      memory: number;
      memUsed: number;
      memTotal: number;
      uptime: number;
      cpuCores: number;
      serverTimestamp: string;
    } | null,
    history: [] as { cpu: number; memory: number; timestamp: string }[],
    connected: true,
  },
}));

vi.mock('@/lib/MetricsContext', () => ({
  useMetrics: () => mockMetrics,
}));

const GiB = 1024 * 1024 * 1024;

function makeLatest(memory: number, memUsedGiB = 10) {
  return {
    cpu: 25.5,
    memory,
    memUsed: memUsedGiB * GiB,
    memTotal: 16 * GiB,
    uptime: 3600,
    cpuCores: 8,
    serverTimestamp: new Date().toISOString(),
  };
}

describe('MemoryWidget', () => {
  it('renders nothing when latest metrics are not yet available', () => {
    mockMetrics.latest = null;
    mockMetrics.history = [];
    const { container } = render(<MemoryWidget />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Physical Memory heading', () => {
    mockMetrics.latest = makeLatest(62.3);
    mockMetrics.history = [
      { cpu: 20, memory: 60, timestamp: new Date().toISOString() },
      { cpu: 25, memory: 62, timestamp: new Date().toISOString() },
    ];
    render(<MemoryWidget />);
    expect(screen.getByText('Physical Memory')).toBeDefined();
  });

  it('renders memory percentage', () => {
    mockMetrics.latest = makeLatest(62.3);
    render(<MemoryWidget />);
    expect(screen.getByText('62.3%')).toBeDefined();
  });

  it('renders used and total memory', () => {
    mockMetrics.latest = makeLatest(62.3);
    render(<MemoryWidget />);
    expect(screen.getByText('10.00 GB')).toBeDefined();
    expect(screen.getByText('16.00 GB')).toBeDefined();
  });

  it('renders the area chart', () => {
    mockMetrics.latest = makeLatest(62.3);
    render(<MemoryWidget />);
    expect(screen.getByTestId('area-chart')).toBeDefined();
  });

  it('shows System Healthy status for low memory (62.3%)', () => {
    mockMetrics.latest = makeLatest(62.3);
    render(<MemoryWidget />);
    expect(screen.getByText('Healthy')).toBeDefined();
  });

  it('shows High Usage status when memory is above 70%', () => {
    mockMetrics.latest = makeLatest(75);
    render(<MemoryWidget />);
    expect(screen.getByText('High')).toBeDefined();
  });

  it('shows Critical Pressure status when memory is above 90%', () => {
    mockMetrics.latest = makeLatest(95);
    render(<MemoryWidget />);
    expect(screen.getByText('Critical')).toBeDefined();
  });

  it('shows High Usage at exactly 71%', () => {
    mockMetrics.latest = makeLatest(71);
    render(<MemoryWidget />);
    expect(screen.getByText('High')).toBeDefined();
  });

  it('shows Critical Pressure at exactly 91%', () => {
    mockMetrics.latest = makeLatest(91);
    render(<MemoryWidget />);
    expect(screen.getByText('Critical')).toBeDefined();
  });

  it('renders Details link', () => {
    mockMetrics.latest = makeLatest(62.3);
    render(<MemoryWidget />);
    const link = screen.getByText('Details');
    expect(link.tagName.toLowerCase()).toBe('a');
  });

  it('renders Usage label', () => {
    mockMetrics.latest = makeLatest(62.3);
    render(<MemoryWidget />);
    expect(screen.getByText('Usage')).toBeDefined();
  });

  it('renders RAM Status label', () => {
    mockMetrics.latest = makeLatest(62.3);
    render(<MemoryWidget />);
    expect(screen.getByText('RAM Status')).toBeDefined();
  });
});
