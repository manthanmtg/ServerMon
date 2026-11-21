import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DatabasesRoute from './page';

vi.mock('@/components/layout/ProShell', () => ({
  default: ({
    title,
    subtitle,
    children,
  }: {
    title: string;
    subtitle: string;
    children: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </main>
  ),
}));

vi.mock('@/modules/databases/ui/DatabasesPage', () => ({
  default: () => <div data-testid="databases-page">DatabasesPage</div>,
}));

describe('DatabasesRoute', () => {
  it('renders the Databases module inside the shell', () => {
    render(<DatabasesRoute />);

    expect(screen.getByText('Databases')).toBeTruthy();
    expect(screen.getByText('Deploy and operate Docker-based databases')).toBeTruthy();
    expect(screen.getByTestId('databases-page')).toBeTruthy();
  });
});
