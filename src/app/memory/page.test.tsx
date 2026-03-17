import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';

vi.mock('@/lib/MetricsContext', () => ({
  MetricsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="metrics-provider">{children}</div>
  ),
  useMetrics: () => ({
    latest: null,
    history: [],
    connected: false,
  }),
}));

vi.mock('@/modules/memory/ui/MemoryPage', () => ({
  default: () => <div data-testid="memory-page">MemoryPage</div>,
}));

describe('Memory page route', () => {
  it('renders MemoryPage wrapped in MetricsProvider', () => {
    render(<Page />);
    expect(screen.getByTestId('metrics-provider')).toBeDefined();
    expect(screen.getByTestId('memory-page')).toBeDefined();
  });

  it('renders without ProShell (MetricsProvider wraps directly)', () => {
    const { container } = render(<Page />);
    expect(container.querySelector('[data-testid="pro-shell"]')).toBeNull();
  });
});
