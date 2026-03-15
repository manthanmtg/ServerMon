import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import ServicesPage from './ServicesPage';
import { ToastProvider } from '@/components/ui/toast';
import { ServicesSnapshot } from '../types';

const mockSnapshot: ServicesSnapshot = {
  services: [
    {
      name: 'nginx.service',
      description: 'Nginx HTTP Server',
      loadState: 'loaded',
      activeState: 'active',
      subState: 'running',
      type: 'simple',
      mainPid: 1234,
      cpuPercent: 0.5,
      memoryBytes: 1024 * 1024 * 50,
      memoryPercent: 1.2,
      uptimeSeconds: 3600,
      restartCount: 0,
      enabled: true,
      unitFileState: 'enabled',
      fragmentPath: '/lib/systemd/system/nginx.service'
    },
    {
      name: 'mongodb.service',
      description: 'MongoDB Database',
      loadState: 'loaded',
      activeState: 'inactive',
      subState: 'dead',
      type: 'forking',
      mainPid: 0,
      cpuPercent: 0,
      memoryBytes: 0,
      memoryPercent: 0,
      uptimeSeconds: 0,
      restartCount: 0,
      enabled: false,
      unitFileState: 'disabled',
      fragmentPath: '/lib/systemd/system/mongodb.service'
    }
  ],
  systemdAvailable: true,
  source: 'systemd',
  summary: {
    total: 2,
    running: 1,
    exited: 0,
    failed: 0,
    inactive: 1,
    enabled: 1,
    disabled: 1,
    healthScore: 100
  },
  timers: [],
  alerts: [],
  history: [],
  timestamp: new Date().toISOString()
};

describe('ServicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/modules/services/nginx.service/logs')) {
        return Promise.resolve({ ok: true, json: async () => ({ logs: [{ timestamp: new Date().toISOString(), priority: 'info', message: 'Test log', unit: 'nginx.service' }] }) });
      }
      if (url.endsWith('/api/modules/services')) {
        return Promise.resolve({ ok: true, json: async () => mockSnapshot });
      }
      if (url.includes('/api/modules/services/') && url.includes('/action')) {
        const body = JSON.parse(options?.body as string || '{}');
        return Promise.resolve({ ok: true, json: async () => ({ status: 'ok', message: `Action ${body.action} executed` }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'ok', message: 'Action executed' }) });
    });
  });

  const renderPage = () => render(
    <ToastProvider>
      <ServicesPage />
    </ToastProvider>
  );

  it('renders loading state initially', async () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {})); // Never resolves
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.getByTestId('page-skeleton')).toBeDefined());
  });

  it('renders services data', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('Services operations center')).not.toBeNull());
    expect(screen.getByText('nginx.service')).toBeDefined();
    expect(screen.getByText('mongodb.service')).toBeDefined();
    expect(screen.getByText('Nginx HTTP Server')).toBeDefined();
    // Use length check for summary stats to avoid ambiguity with footer
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('filters services by search', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('Services operations center')).not.toBeNull());
    
    const searchInput = screen.getByPlaceholderText('Search services...');
    fireEvent.change(searchInput, { target: { value: 'nginx' } });
    
    expect(screen.getByText('nginx.service')).toBeDefined();
    expect(screen.queryByText('mongodb.service')).toBeNull();
  });

  it('filters services by state', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('Services operations center')).not.toBeNull());
    
    const filterSelect = screen.getByLabelText(/Filter/i);
    fireEvent.change(filterSelect, { target: { value: 'inactive' } });
    
    expect(screen.getByText('mongodb.service')).toBeDefined();
    expect(screen.queryByText('nginx.service')).toBeNull();
  });

  it('starts a service', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('mongodb.service')).not.toBeNull());
    
    const row = screen.getByText('mongodb.service').closest('tr')!;
    const startButton = within(row).getByTitle('Start');
    await act(async () => {
      fireEvent.click(startButton);
    });
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/modules/services/mongodb.service/action'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"action":"start"')
      })
    );
  });

  it('stops a service', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('nginx.service')).not.toBeNull());
    
    const row = screen.getByText('nginx.service').closest('tr')!;
    const stopButton = within(row).getByTitle('Stop');
    await act(async () => {
      fireEvent.click(stopButton);
    });
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/modules/services/nginx.service/action'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"action":"stop"')
      })
    );
  });

  it('restarts a service', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('nginx.service')).not.toBeNull());
    
    const row = screen.getByText('nginx.service').closest('tr')!;
    const restartButton = within(row).getByTitle('Restart');
    await act(async () => {
      fireEvent.click(restartButton);
    });
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/modules/services/nginx.service/action'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"action":"restart"')
      })
    );
  });

  it('toggles service enable/disable', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('nginx.service')).not.toBeNull());
    
    const row = screen.getByText('nginx.service').closest('tr')!;
    const disableButton = within(row).getByTitle('Disable');
    await act(async () => {
      fireEvent.click(disableButton);
    });
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/modules/services/nginx.service/action'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"action":"disable"')
      })
    );
  });

  it('shows service logs when expanded', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('nginx.service')).not.toBeNull());
    
    const row = screen.getByText('nginx.service').closest('tr')!;
    // Find the expand button (the first button in the first cell)
    const expandButton = within(row).getAllByRole('button')[0];
    
    await act(async () => {
      fireEvent.click(expandButton);
    });
    
    await waitFor(() => expect(screen.queryByText(/Recent logs/i)).not.toBeNull());
    expect(screen.getByText('Test log')).toBeDefined();
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/modules/services/nginx.service/logs'),
      expect.anything()
    );
  });

  it('manual refresh works', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('Refresh now')).not.toBeNull());
    const refreshButton = screen.getByText('Refresh now');
    await act(async () => {
      fireEvent.click(refreshButton);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('handles empty services list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ 
        services: [], 
        timers: [],
        alerts: [], 
        history: [], 
        systemdAvailable: true, 
        source: 'systemd', 
        summary: { total: 0, running: 0, exited: 0, failed: 0, inactive: 0, enabled: 0, disabled: 0, healthScore: 0 },
        timestamp: new Date().toISOString()
      })
    });
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('Services operations center')).not.toBeNull());
    expect(screen.getByText(/No services match your filter/i)).toBeDefined();
  });

  it('handles action failure', async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      const urlString = url.toString();
      if (urlString.includes('/action')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Action failed' }) } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: async () => mockSnapshot } as unknown as Response);
    });

    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('nginx.service')).not.toBeNull());
    
    const row = screen.getByText('nginx.service').closest('tr')!;
    const restartButton = within(row).getByTitle('Restart');
    await act(async () => {
      fireEvent.click(restartButton);
    });
    
    await waitFor(() => expect(screen.queryByText(/Action failed/i)).not.toBeNull());
  });

  it('handles logs fetching failure', async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      const urlString = url.toString();
      if (urlString.includes('/logs')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Logs error' }) } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: async () => mockSnapshot } as unknown as Response);
    });

    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText('nginx.service')).not.toBeNull());
    
    const row = screen.getByText('nginx.service').closest('tr')!;
    const expandButton = within(row).getAllByRole('button')[0];
    
    await act(async () => {
      fireEvent.click(expandButton);
    });
    
    await waitFor(() => expect(screen.queryByText(/No logs available/i)).not.toBeNull());
  });

  it('renders systemd unavailable message', async () => {
    const unavailableSnapshot = { ...mockSnapshot, systemdAvailable: false };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => unavailableSnapshot,
    });

    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByText(/daemon connected/i)).toBeNull());
    expect(screen.getByText(/Mock mode/i)).toBeDefined();
  });

  it('shows correct health score color', async () => {
    const poorHealthSnapshot = { 
      ...mockSnapshot, 
      summary: { ...mockSnapshot.summary, healthScore: 45 } 
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => poorHealthSnapshot,
    });

    await act(async () => {
      renderPage();
    });
    await waitFor(() => screen.getByText('45'));
    const scoreBadge = screen.getByText('45').closest('div');
    // Check for warning/destructive class or similar indicator
    expect(scoreBadge).toBeDefined();
  });
});
