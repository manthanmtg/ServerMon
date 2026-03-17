import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DiskRoute from './page';

vi.mock('@/components/layout/ProShell', () => ({
  default: ({
    children,
    title,
    subtitle,
  }: {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
  }) => (
    <div data-testid="pro-shell">
      <span data-testid="title">{title}</span>
      {subtitle && <span data-testid="subtitle">{subtitle}</span>}
      {children}
    </div>
  ),
}));

vi.mock('@/lib/MetricsContext', () => ({
  MetricsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="metrics-provider">{children}</div>
  ),
  useMetrics: () => ({
    latest: null,
    history: [],
    connected: false,
  }),
}));

vi.mock('@/modules/disk/ui/DiskPage', () => ({
  default: () => <div data-testid="disk-page">DiskPage</div>,
}));

describe('Disk page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<DiskRoute />);
    expect(screen.getByTestId('title').textContent).toBe('Disk Monitor');
    expect(screen.getByTestId('subtitle').textContent).toBe('Storage and I/O Performance');
  });

  it('renders DiskPage inside MetricsProvider', () => {
    render(<DiskRoute />);
    expect(screen.getByTestId('metrics-provider')).toBeDefined();
    expect(screen.getByTestId('disk-page')).toBeDefined();
  });
});
