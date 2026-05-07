import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CapacityAnalysis } from './CapacityAnalysis';

vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => <div data-testid="bar" />,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

describe('CapacityAnalysis', () => {
  const mockResults = [
    { name: 'usr', path: '/usr', size: 1000000, sizeStr: '1MB' },
    { name: 'var', path: '/var', size: 2000000, sizeStr: '2MB' },
  ];

  const mockSettings = { unitSystem: 'si' as const };

  it('renders ready state when no results', () => {
    render(
      <CapacityAnalysis
        scanPath="/"
        setScanPath={() => {}}
        runScan={() => {}}
        scanning={false}
        scanResults={[]}
        settings={mockSettings}
      />
    );
    expect(screen.getByText('Ready for Analysis')).toBeDefined();
  });

  it('renders chart container when results provided', () => {
    render(
      <CapacityAnalysis
        scanPath="/"
        setScanPath={() => {}}
        runScan={() => {}}
        scanning={false}
        scanResults={mockResults}
        settings={mockSettings}
      />
    );
    expect(screen.getByTestId('bar-chart')).toBeDefined();
  });

  it('shows spinner when scanning', () => {
    render(
      <CapacityAnalysis
        scanPath="/"
        setScanPath={() => {}}
        runScan={() => {}}
        scanning={true}
        scanResults={[]}
        settings={mockSettings}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});
