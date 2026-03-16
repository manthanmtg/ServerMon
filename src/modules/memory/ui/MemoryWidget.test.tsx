import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MemoryWidget from './MemoryWidget';

vi.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Use vi.hoisted so mockMetrics is available when vi.mock factory runs
const { mockMetrics } = vi.hoisted(() => ({
  mockMetrics: {
    latest: {
      cpu: 25.5,
      memory: 62.3,
      memUsed: 10 * 1024 * 1024 * 1024,
      memTotal: 16 * 1024 * 1024 * 1024,
      uptime: 3600,
      cpuCores: 8,
      serverTimestamp: new Date().toISOString(),
    },
    history: [
      { cpu: 20, memory: 60, timestamp: new Date().toISOString() },
      { cpu: 25, memory: 62, timestamp: new Date().toISOString() },
    ],
    connected: true,
  },
}));

vi.mock('@/lib/MetricsContext', () => ({
  useMetrics: () => mockMetrics,
}));

describe('MemoryWidget', () => {
  it('renders Physical Memory heading', () => {
    render(<MemoryWidget />);
    expect(screen.getByText('Physical Memory')).toBeDefined();
  });

  it('renders memory percentage', () => {
    render(<MemoryWidget />);
    expect(screen.getByText('62.3%')).toBeDefined();
  });

  it('renders used and total memory', () => {
    render(<MemoryWidget />);
    expect(screen.getByText('10.00 GB')).toBeDefined();
    expect(screen.getByText('16.00 GB')).toBeDefined();
  });

  it('renders the area chart', () => {
    render(<MemoryWidget />);
    expect(screen.getByTestId('area-chart')).toBeDefined();
  });

  it('shows System Healthy status for low memory (62.3%)', () => {
    render(<MemoryWidget />);
    expect(screen.getByText('System Healthy')).toBeDefined();
  });

  it('renders View Specs link', () => {
    render(<MemoryWidget />);
    const link = screen.getByText('View Specs');
    expect(link.tagName.toLowerCase()).toBe('a');
  });

  it('renders Usage Level label', () => {
    render(<MemoryWidget />);
    expect(screen.getByText('Usage Level')).toBeDefined();
  });

  it('renders RAM Status label', () => {
    render(<MemoryWidget />);
    expect(screen.getByText('RAM Status')).toBeDefined();
  });
});
