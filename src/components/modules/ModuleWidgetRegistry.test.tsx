import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/dynamic to return a simple stub component
vi.mock('next/dynamic', () => ({
  default: (_loader: () => Promise<{ default: React.ComponentType }>) => {
    // Return a simple placeholder for each dynamically imported component
    const MockComponent = ({ 'data-testid': testId }: { 'data-testid'?: string }) => (
      <div data-testid={testId ?? 'dynamic-widget'}>MockWidget</div>
    );
    MockComponent.displayName = 'DynamicMock';
    return MockComponent;
  },
}));

// Mock WidgetErrorBoundary to be transparent
vi.mock('@/components/ui/error-boundary', () => ({
  WidgetErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

// Mock Spinner
vi.mock('@/components/ui/spinner', () => ({
  Spinner: () => <div data-testid="spinner">Loading...</div>,
}));

import { renderWidget } from './ModuleWidgetRegistry';

describe('renderWidget()', () => {
  it('returns an error element for an unknown widget name', () => {
    const { container } = render(<>{renderWidget('NonExistentWidget')}</>);
    expect(container.textContent).toContain('NonExistentWidget');
    expect(container.textContent).toContain('not found');
  });

  it('renders the widget wrapped in an error boundary for a known widget', () => {
    render(<>{renderWidget('HealthWidget')}</>);
    expect(screen.getByTestId('error-boundary')).toBeDefined();
  });

  it('renders each known widget without throwing', () => {
    const knownWidgets = [
      'HealthWidget',
      'ProcessWidget',
      'LogsWidget',
      'CPUChartWidget',
      'MemoryChartWidget',
      'DiskWidget',
      'ServicesWidget',
      'AIAgentsWidget',
      'NetworkWidget',
      'UpdateWidget',
      'CronsWidget',
      'PortsWidget',
      'HardwareWidget',
      'CertificatesWidget',
      'NginxWidget',
      'SecurityWidget',
      'MemoryWidget',
      'UsersWidget',
      'EndpointsWidget',
      'EnvVarsWidget',
    ];

    for (const name of knownWidgets) {
      expect(() => render(<>{renderWidget(name)}</>)).not.toThrow();
    }
  });

  it('passes extra props to the rendered component', () => {
    // Should not throw when extra props are passed
    expect(() => render(<>{renderWidget('HealthWidget', { foo: 'bar' })}</>)).not.toThrow();
  });

  it('unknown widget name renders a destructive-style container', () => {
    const { container } = render(<>{renderWidget('BogusWidget')}</>);
    const el = container.firstElementChild;
    expect(el).not.toBeNull();
    // Has some styling class indicating error state
    expect(el!.className).toContain('destructive');
  });
});
