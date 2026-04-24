import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import UpdatesPageRoute from './page';

vi.mock('@/components/layout/ProShell', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="pro-shell">
      <span data-testid="title">{title}</span>
      {children}
    </div>
  ),
}));

vi.mock('@/modules/updates/ui/UpdatePage', () => ({
  default: () => <div data-testid="update-page">UpdatePage</div>,
}));

describe('Updates page route', () => {
  it('renders ProShell with correct title', () => {
    render(<UpdatesPageRoute />);
    expect(screen.getByTestId('title').textContent).toBe('System Updates');
  });

  it('renders UpdatePage inside ProShell', () => {
    render(<UpdatesPageRoute />);
    expect(screen.getByTestId('update-page')).toBeDefined();
  });
});
