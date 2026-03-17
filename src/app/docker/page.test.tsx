import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DockerRoute from './page';

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

vi.mock('@/modules/docker/ui/DockerPage', () => ({
  default: () => <div data-testid="docker-page">DockerPage</div>,
}));

describe('Docker page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<DockerRoute />);
    expect(screen.getByTestId('title').textContent).toBe('Docker Monitor');
    expect(screen.getByTestId('subtitle').textContent).toBe(
      'Containers, Images, and Runtime Health'
    );
  });

  it('renders DockerPage inside ProShell', () => {
    render(<DockerRoute />);
    expect(screen.getByTestId('docker-page')).toBeDefined();
  });
});
