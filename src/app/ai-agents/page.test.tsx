import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AIAgentsRoute from './page';

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

vi.mock('@/modules/ai-agents/ui/AIAgentsPage', () => ({
  default: () => <div data-testid="ai-agents-page">AIAgentsPage</div>,
}));

describe('AI Agents page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<AIAgentsRoute />);
    expect(screen.getByTestId('title').textContent).toBe('AI Agents');
    expect(screen.getByTestId('subtitle').textContent).toBe('Monitor and Manage AI Coding Agents');
  });

  it('renders AIAgentsPage inside ProShell', () => {
    render(<AIAgentsRoute />);
    expect(screen.getByTestId('ai-agents-page')).toBeDefined();
  });
});
