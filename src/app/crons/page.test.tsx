import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CronsRoute from './page';

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

vi.mock('@/modules/crons/ui/CronsPage', () => ({
  default: () => <div data-testid="crons-page">CronsPage</div>,
}));

describe('Crons page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<CronsRoute />);
    expect(screen.getByTestId('title').textContent).toBe('Cron Jobs');
    expect(screen.getByTestId('subtitle').textContent).toBe(
      'Schedules, Execution History, and Management'
    );
  });

  it('renders CronsPage inside ProShell', () => {
    render(<CronsRoute />);
    expect(screen.getByTestId('crons-page')).toBeDefined();
  });
});
