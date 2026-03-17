import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HardwareRoute from './page';

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

vi.mock('@/modules/hardware/ui/HardwarePage', () => ({
  default: () => <div data-testid="hardware-page">HardwarePage</div>,
}));

describe('Hardware page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<HardwareRoute />);
    expect(screen.getByTestId('title').textContent).toBe('Hardware Info');
    expect(screen.getByTestId('subtitle').textContent).toBe('System Specifications & Sensors');
  });

  it('renders HardwarePage inside ProShell', () => {
    render(<HardwareRoute />);
    expect(screen.getByTestId('hardware-page')).toBeDefined();
  });
});
