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

vi.mock('@/modules/terminal/ui/TerminalPage', () => ({
  default: () => <div data-testid="terminal-page">TerminalPage</div>,
}));

describe('Terminal page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<Page />);
    expect(screen.getByTestId('title').textContent).toBe('Terminal');
    expect(screen.getByTestId('subtitle').textContent).toBe('Remote Shell');
  });

  it('renders TerminalPage inside ProShell', () => {
    render(<Page />);
    expect(screen.getByTestId('terminal-page')).toBeDefined();
  });
});
