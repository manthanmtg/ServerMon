import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import DashboardPage from './page';

// Mock ProShell
vi.mock('@/components/layout/ProShell', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="pro-shell">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// Mock ModuleWidgetRegistry
vi.mock('@/components/modules/ModuleWidgetRegistry', () => ({
  renderWidget: (name: string) => <div data-testid={`widget-${name}`}>{name}</div>,
}));

const mockMetrics = {
  latest: {
    cpu: 25.5,
    cpuCores: 8,
    memory: 45.2,
    memUsed: 8 * 1024 * 1024 * 1024,
    memTotal: 16 * 1024 * 1024 * 1024,
    uptime: 3600 * 24 + 3600 * 5, // 1d 5h
    serverTimestamp: new Date().toISOString(),
  },
  history: [
    { cpu: 20, memory: 40, timestamp: new Date().toISOString() },
    { cpu: 25, memory: 45, timestamp: new Date().toISOString() },
  ],
  connected: true,
};

let currentMetrics = { ...mockMetrics };

vi.mock('@/lib/MetricsContext', async () => {
  const actual = await vi.importActual('@/lib/MetricsContext');
  return {
    ...actual,
    useMetrics: () => currentMetrics,
    MetricsProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="metrics-provider">{children}</div>,
  };
});

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMetrics = { ...mockMetrics };
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/health/ping') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'ok' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  const renderPage = async () => {
    let result: ReturnType<typeof render> | undefined;
    await act(async () => {
      result = render(<DashboardPage />);
    });
    return result!;
  };

  it('renders the Dashboard page within ProShell', async () => {
    await renderPage();
    expect(screen.getByTestId('pro-shell')).toBeDefined();
    expect(screen.getByText('Dashboard')).toBeDefined();
  });

  it('renders all stat cards with correct data', async () => {
    await renderPage();
    
    // CPU Card
    expect(screen.getByText('CPU')).toBeDefined();
    expect(screen.getByText('25.5%')).toBeDefined();
    expect(screen.getByText('8 Cores')).toBeDefined();
    
    // Memory Card
    expect(screen.getByText('Memory')).toBeDefined();
    expect(screen.getByText('45.2%')).toBeDefined();
    expect(screen.getByText('8.0 of 16.0 GB')).toBeDefined();
    
    // Uptime Card
    expect(screen.getByText('Uptime')).toBeDefined();
    expect(screen.getByText('1d 5h')).toBeDefined();
    
    // Latency Card
    expect(screen.getByText('Data Latency')).toBeDefined();
    
    // Ping Card
    expect(screen.getByText('Ping')).toBeDefined();
  });

  it('renders all chart and info cards', async () => {
    await renderPage();
    
    expect(screen.getByText('CPU Usage')).toBeDefined();
    expect(screen.getByText('Memory Usage')).toBeDefined();
    expect(screen.getByText('Recent Activity')).toBeDefined();
    expect(screen.getByText('System Health')).toBeDefined();
  });

  it('renders widgets from registry', async () => {
    await renderPage();
    
    expect(screen.getByTestId('widget-CPUChartWidget')).toBeDefined();
    expect(screen.getByTestId('widget-MemoryChartWidget')).toBeDefined();
    expect(screen.getByTestId('widget-LogsWidget')).toBeDefined();
    expect(screen.getByTestId('widget-HealthWidget')).toBeDefined();
  });

  it('shows live badge when connected', async () => {
    await renderPage();
    expect(screen.getByText('Live')).toBeDefined();
  });

  it('handles offline state correctly', async () => {
    currentMetrics = { ...mockMetrics, connected: false };
    
    await renderPage();
    await waitFor(() => expect(screen.queryByText('Offline')).not.toBeNull());
    expect(screen.getByText('Reconnecting...')).toBeDefined();
  });

  it('renders uptime for hours/minutes correctly', async () => {
     currentMetrics = { 
       ...mockMetrics, 
       latest: { ...mockMetrics.latest, uptime: 3600 * 2 + 60 * 30 } // 2h 30m
     };
     
     await renderPage();
     await waitFor(() => expect(screen.queryByText('2h 30m')).not.toBeNull());
  });

  it('renders uptime for minutes/seconds correctly', async () => {
     currentMetrics = { 
       ...mockMetrics, 
       latest: { ...mockMetrics.latest, uptime: 60 * 5 + 45 } // 5m 45s
     };
     
     await renderPage();
     await waitFor(() => expect(screen.queryByText('5m 45s')).not.toBeNull());
  });

  it('shows warning status when CPU is high', async () => {
    currentMetrics = { 
      ...mockMetrics, 
      latest: { ...mockMetrics.latest, cpu: 95 } 
    };
    
    await renderPage();
    await waitFor(() => {
      const cpuValue = screen.getByText('95.0%');
      expect(cpuValue.className).toContain('text-warning');
    });
  });

  it('shows warning status when Memory is high', async () => {
    currentMetrics = { 
      ...mockMetrics, 
      latest: { ...mockMetrics.latest, memory: 85 } 
    };
    
    await renderPage();
    await waitFor(() => {
      const memValue = screen.getByText('85.0%');
      expect(memValue.className).toContain('text-warning');
    });
  });

  it('performs ping and updates state', async () => {
    await renderPage();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/health/ping'));
  });

  it('handles ping failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await renderPage();
    await waitFor(() => expect(screen.getByText('--')).toBeDefined());
  });
});
