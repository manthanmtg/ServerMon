import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GuidePageRoute from './page';

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

vi.mock('@/modules/guide/ui/UserGuidePage', () => ({
  default: () => <div data-testid="user-guide-page">UserGuidePage</div>,
}));

describe('Guide page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<GuidePageRoute />);
    expect(screen.getByTestId('title').textContent).toBe('User Guide');
    expect(screen.getByTestId('subtitle').textContent).toBe('Knowledge Center');
  });

  it('renders UserGuidePage inside ProShell', () => {
    render(<GuidePageRoute />);
    expect(screen.getByTestId('user-guide-page')).toBeDefined();
  });
});
