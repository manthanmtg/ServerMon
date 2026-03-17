import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NginxRoute from './page';

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

vi.mock('@/modules/nginx/ui/NginxPage', () => ({
  default: () => <div data-testid="nginx-page">NginxPage</div>,
}));

describe('Nginx page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<NginxRoute />);
    expect(screen.getByTestId('title').textContent).toBe('Nginx Manager');
    expect(screen.getByTestId('subtitle').textContent).toBe('Reverse Proxy & Virtual Hosts');
  });

  it('renders NginxPage inside ProShell', () => {
    render(<NginxRoute />);
    expect(screen.getByTestId('nginx-page')).toBeDefined();
  });
});
