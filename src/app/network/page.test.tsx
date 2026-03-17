import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';

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

vi.mock('@/modules/network/ui/NetworkPage', () => ({
  default: () => <div data-testid="network-page">NetworkPage</div>,
}));

describe('Network page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<Page />);
    expect(screen.getByTestId('title').textContent).toBe('Network Monitor');
    expect(screen.getByTestId('subtitle').textContent).toBe(
      'Real-time traffic and connection analysis'
    );
  });

  it('renders NetworkPage inside ProShell', () => {
    render(<Page />);
    expect(screen.getByTestId('network-page')).toBeDefined();
  });
});
