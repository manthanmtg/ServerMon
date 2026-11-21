import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemMetric } from '@/lib/MetricsContext';

const { metricsState, mockUseReducedMotion } = vi.hoisted(() => ({
  metricsState: { latest: null as SystemMetric | null },
  mockUseReducedMotion: vi.fn(() => false),
}));

vi.mock('@/lib/MetricsContext', () => ({
  useMetrics: () => ({ latest: metricsState.latest, history: [], connected: true }),
}));

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: mockUseReducedMotion };
});

import HealthWidget from './HealthWidget';

function metric(cpu = 45.5, memory = 62.3, disk = 30.1): SystemMetric {
  return {
    timestamp: '2026-08-20T10:00:00.000Z',
    serverTimestamp: '2026-08-20T10:00:00.000Z',
    cpu,
    memory,
    cpuCores: 4,
    memTotal: 8_000_000_000,
    memUsed: 4_000_000_000,
    uptime: 100,
    swapTotal: 0,
    swapUsed: 0,
    swapFree: 0,
    disks: [{ fs: '/', type: 'ext4', size: 100, used: 30, available: 70, use: disk, mount: '/' }],
    io: null,
  };
}

describe('HealthWidget', () => {
  beforeEach(() => {
    metricsState.latest = null;
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('renders labels and empty values before shared metrics arrive', () => {
    render(<HealthWidget />);
    expect(screen.getByText('CPU')).toBeDefined();
    expect(screen.getByText('Memory')).toBeDefined();
    expect(screen.getByText('Disk')).toBeDefined();
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('renders CPU, memory, and disk from the shared metrics source', () => {
    metricsState.latest = metric();
    render(<HealthWidget />);

    expect(screen.getByText('45.5%')).toBeDefined();
    expect(screen.getByText('62.3%')).toBeDefined();
    expect(screen.getByText('30.1%')).toBeDefined();
  });

  it('prefers an explicit metric while preserving the context fallback', () => {
    metricsState.latest = metric(10, 20, 30);
    const { rerender } = render(<HealthWidget metric={metric(72.4, 51.2, 63.5)} />);

    expect(screen.getByText('72.4%')).toBeDefined();
    rerender(<HealthWidget metric={null} />);
    expect(screen.getByText('10.0%')).toBeDefined();
  });

  it('removes decorative infinite motion when reduced motion is preferred', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<HealthWidget metric={metric(10, 20, 30)} />);

    expect(screen.queryByTestId('health-progress-shimmer')).toBeNull();
    expect(screen.getByText('10.0%')).toBeDefined();
  });
});
