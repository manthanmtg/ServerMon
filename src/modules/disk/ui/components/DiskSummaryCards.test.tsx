import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiskSummaryCards } from './DiskSummaryCards';
import type { SystemMetric } from '@/lib/MetricsContext';

const disk = {
  fs: '/dev/disk1',
  type: 'ext4',
  size: 1_000_000_000,
  used: 500_000_000,
  available: 500_000_000,
  use: 50,
  mount: '/',
} satisfies SystemMetric['disks'][number];

describe('DiskSummaryCards', () => {
  it('lets the total activity footer wrap instead of clipping on narrow screens', () => {
    render(
      <DiskSummaryCards
        disks={[disk]}
        healthDriveCount={1}
        primaryDisk={disk}
        settings={{ unitSystem: 'decimal' }}
        totalIORead={9_876_543_210}
        totalIOWrite={1_234_567_890}
      />
    );

    const totalActivity = screen.getByText('Total Activity:').parentElement;

    expect(totalActivity?.className).toContain('flex-wrap');
    expect(totalActivity?.className).not.toContain('whitespace-nowrap');
    expect(totalActivity?.className).not.toContain('overflow-hidden');
  });
});
