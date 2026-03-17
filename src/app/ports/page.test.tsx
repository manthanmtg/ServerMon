import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PortsRoute from './page';

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

vi.mock('@/modules/ports/ui/PortsPage', () => ({
  default: () => <div data-testid="ports-page">PortsPage</div>,
}));

describe('Ports page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<PortsRoute />);
    expect(screen.getByTestId('title').textContent).toBe('Ports Monitor');
    expect(screen.getByTestId('subtitle').textContent).toBe(
      'Listening Ports, Availability & Firewall'
    );
  });

  it('renders PortsPage inside ProShell', () => {
    render(<PortsRoute />);
    expect(screen.getByTestId('ports-page')).toBeDefined();
  });
});
