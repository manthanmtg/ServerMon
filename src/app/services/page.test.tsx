import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServicesRoute from './page';

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

vi.mock('@/modules/services/ui/ServicesPage', () => ({
  default: () => <div data-testid="services-page">ServicesPage</div>,
}));

describe('Services page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<ServicesRoute />);
    expect(screen.getByTestId('title').textContent).toBe('Services Monitor');
    expect(screen.getByTestId('subtitle').textContent).toBe(
      'Systemd Services, Timers, and Alerts'
    );
  });

  it('renders ServicesPage inside ProShell', () => {
    render(<ServicesRoute />);
    expect(screen.getByTestId('services-page')).toBeDefined();
  });
});
