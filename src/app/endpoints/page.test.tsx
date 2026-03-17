import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EndpointsRoute from './page';

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

vi.mock('@/modules/endpoints/ui/EndpointsPage', () => ({
  default: () => <div data-testid="endpoints-page">EndpointsPage</div>,
}));

describe('Endpoints page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<EndpointsRoute />);
    expect(screen.getByTestId('title').textContent).toBe('Endpoints');
    expect(screen.getByTestId('subtitle').textContent).toBe('Custom API Builder');
  });

  it('renders EndpointsPage inside ProShell', () => {
    render(<EndpointsRoute />);
    expect(screen.getByTestId('endpoints-page')).toBeDefined();
  });
});
