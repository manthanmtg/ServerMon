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

vi.mock('@/modules/processes/ui/ProcessWidget', () => ({
  default: () => <div data-testid="process-widget">ProcessWidget</div>,
}));

describe('Processes page', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<Page />);
    expect(screen.getByTestId('title').textContent).toBe('Processes');
    expect(screen.getByTestId('subtitle').textContent).toBe('System Processes');
  });

  it('renders the ProcessWidget', () => {
    render(<Page />);
    expect(screen.getByTestId('process-widget')).toBeDefined();
  });
});
