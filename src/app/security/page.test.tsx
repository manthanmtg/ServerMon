import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SecurityRoute from './page';

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

vi.mock('@/modules/security/ui/SecurityPage', () => ({
  default: () => <div data-testid="security-page">SecurityPage</div>,
}));

describe('Security page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<SecurityRoute />);
    expect(screen.getByTestId('title').textContent).toBe('Security Audit');
    expect(screen.getByTestId('subtitle').textContent).toBe(
      'Posture Dashboard & Vulnerability Scanning'
    );
  });

  it('renders SecurityPage inside ProShell', () => {
    render(<SecurityRoute />);
    expect(screen.getByTestId('security-page')).toBeDefined();
  });
});
