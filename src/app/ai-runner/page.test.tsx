import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AIRunnerRoute from './page';

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

vi.mock('@/modules/ai-runner/ui/AIRunnerPage', () => ({
  default: () => <div data-testid="ai-runner-page">AIRunnerPage</div>,
}));

describe('AI Runner page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<AIRunnerRoute />);
    expect(screen.getByTestId('title').textContent).toBe('AI Runner');
    expect(screen.getByTestId('subtitle').textContent).toBe(
      'Execute, Schedule, and Audit AI Agent Runs'
    );
  });

  it('renders AIRunnerPage inside ProShell', () => {
    render(<AIRunnerRoute />);
    expect(screen.getByTestId('ai-runner-page')).toBeDefined();
  });
});
