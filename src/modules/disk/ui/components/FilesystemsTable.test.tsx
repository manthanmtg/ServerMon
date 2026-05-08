import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilesystemsTable } from './FilesystemsTable';
import type { SystemMetric } from '@/lib/MetricsContext';

describe('FilesystemsTable', () => {
  const mockDisks: SystemMetric['disks'] = [
    {
      fs: '/dev/disk1',
      type: 'apfs',
      size: 1000000000,
      used: 800000000,
      available: 200000000,
      use: 80,
      mount: '/',
    },
  ];

  const mockSettings = { unitSystem: 'decimal' as const };

  it('renders table headers', () => {
    const { container } = render(<FilesystemsTable disks={mockDisks} settings={mockSettings} />);
    expect(screen.getByText('Mount')).toBeDefined();
    expect(screen.getByText('Type')).toBeDefined();
    expect(screen.getByText('Free')).toBeDefined();
    expect(container.querySelector('table')?.className).toContain('min-w-[420px]');
  });

  it('renders disk information', () => {
    render(<FilesystemsTable disks={mockDisks} settings={mockSettings} />);
    expect(screen.getByText('/')).toBeDefined();
    expect(screen.getByText('apfs')).toBeDefined();
    // formatBytes(200000000, 'decimal') -> "200 MB" (not 200.0 MB)
    expect(screen.getByText(/200.*MB/)).toBeDefined();
    expect(screen.getByText(/20.*free/)).toBeDefined();
  });
});
