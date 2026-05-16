import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CapacityAnalysis } from './CapacityAnalysis';

vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="bar-chart">{children}</div>
    ),
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

  const mockSettings = { unitSystem: 'decimal' as const };

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders ready state initially', () => {
    render(<CapacityAnalysis settings={mockSettings} />);
    expect(screen.getByText('Ready for Analysis')).toBeDefined();
  });

  it('renders chart container after scanning', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({ results: mockResults }),
    });

    render(<CapacityAnalysis settings={mockSettings} />);
    const button = screen.getByRole('button', { name: /scan/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('bar-chart')).toBeDefined();
    });
  });

  it('shows spinner when scanning', async () => {
    let resolveFetch: (value: unknown) => void;
    (global.fetch as Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    render(<CapacityAnalysis settings={mockSettings} />);
    const button = screen.getByRole('button', { name: /scan/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    // Cleanup
    resolveFetch!({ json: async () => ({ results: [] }) });
  });
});
