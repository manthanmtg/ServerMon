import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import DockerPage from './DockerPage';
import { ToastProvider } from '@/components/ui/toast';

// Mock TerminalUI to avoid complex terminal dependencies in unit tests
vi.mock('@/modules/terminal/ui/TerminalUI', () => ({
  default: () => <div data-testid="mock-terminal">Terminal</div>,
}));

// Mock Recharts components because they are difficult to test in JSDOM
vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const mockSnapshot = {
  source: 'docker',
  daemonReachable: true,
  daemon: {
    name: 'test-daemon',
    serverVersion: '20.10.7',
    apiVersion: '1.41',
    operatingSystem: 'Ubuntu 20.04.2 LTS',
    architecture: 'x86_64',
    containersRunning: 2,
    containersStopped: 1,
    containersPaused: 0,
    storageDriver: 'overlay2',
  },
  diskUsage: {
    imagesBytes: 1000000,
    containersBytes: 500000,
    volumesBytes: 200000,
    buildCacheBytes: 100000,
    totalBytes: 1800000,
    usedPercent: 45.5,
  },
  containers: [
    {
      id: 'container-1',
      name: 'web-server',
      image: 'nginx:latest',
      state: 'running',
      status: 'Up 2 hours',
      createdAt: new Date().toISOString(),
      ports: ['80:80', '443:443'],
      networks: ['bridge'],
      mounts: [{ source: '/host/path', destination: '/container/path', mode: 'rw', rw: true }],
      env: ['NODE_ENV=production'],
      restartCount: 0,
      cpuPercent: 5.5,
      memoryPercent: 12.0,
      memoryUsageBytes: 128000000,
      memoryLimitBytes: 1024000000,
      blockReadBytes: 1024,
      blockWriteBytes: 2048,
      networkInBytes: 512,
      networkOutBytes: 256,
    },
    {
      id: 'container-2',
      name: 'db-server',
      image: 'postgres:13',
      state: 'exited',
      status: 'Exited (0) 5 minutes ago',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      ports: ['5432:5432'],
      networks: ['bridge'],
      mounts: [],
      env: [],
      restartCount: 1,
      cpuPercent: 0,
      memoryPercent: 0,
      memoryUsageBytes: 0,
      memoryLimitBytes: 1024000000,
      blockReadBytes: 0,
      blockWriteBytes: 0,
      networkInBytes: 0,
      networkOutBytes: 0,
    },
  ],
  images: [
    {
      id: 'image-1',
      repository: 'nginx',
      tag: 'latest',
      sizeBytes: 1000000,
      createdAt: new Date().toISOString(),
      containersUsing: 1,
    },
  ],
  volumes: [
    {
      name: 'db-data',
      driver: 'local',
      mountpoint: '/var/lib/docker/volumes/db-data/_data',
      scope: 'local',
    },
  ],
  networks: [{ id: 'net-1', name: 'bridge', driver: 'bridge', scope: 'local' }],
  events: [
    {
      id: 'event-1',
      time: new Date().toISOString(),
      action: 'start',
      type: 'container',
      actor: 'container-1',
      attributes: {},
    },
  ],
  alerts: [
    {
      id: 'alert-1',
      severity: 'warning',
      title: 'High CPU',
      message: 'Container web-server is using 90% CPU',
      source: 'docker',
      active: true,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    },
  ],
  history: [
    {
      timestamp: new Date().toISOString(),
      containers: [
        {
          id: 'container-1',
          name: 'web-server',
          cpuPercent: 5.5,
          memoryPercent: 12.0,
          blockReadBytes: 1024,
          blockWriteBytes: 2048,
          networkInBytes: 512,
          networkOutBytes: 256,
        },
      ],
    },
  ],
  timestamp: new Date().toISOString(),
};

describe('DockerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => mockSnapshot,
      })
    );
    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderPage = async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <ToastProvider>
          <DockerPage />
        </ToastProvider>
      );
    });
    return result!;
  };

  it('renders loading state initially', async () => {
    let resolveFetch: (value: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = (value) => resolve(value);
        })
    );

    await act(async () => {
      render(
        <ToastProvider>
          <DockerPage />
        </ToastProvider>
      );
    });

    await waitFor(() => expect(screen.getByTestId('skeleton-card-0')).toBeDefined());

    await act(async () => {
      resolveFetch({ ok: true, json: async () => mockSnapshot } as Response);
    });

    await waitFor(() => expect(screen.queryByTestId('page-skeleton')).toBeNull(), {
      timeout: 5000,
    });
  });

  it('renders daemon status and source', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Docker operations center'));
    expect(screen.getByText('Daemon connected')).toBeDefined();
    expect(screen.getByText('Source: docker')).toBeDefined();
  });

  it('renders state summary cards', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Running'));

    const runningCard = screen
      .getAllByText('Running')
      .find((el) => el.tagName === 'P' && el.closest('.rounded-xl')) as HTMLElement;
    const stoppedCard = screen.getByText('Stopped').closest('.rounded-xl') as HTMLElement;
    const pausedCard = screen.getByText('Paused').closest('.rounded-xl') as HTMLElement;

    expect(
      within(runningCard!.closest('.rounded-xl') as HTMLElement).getAllByText('2').length
    ).toBeGreaterThan(0);
    expect(within(stoppedCard).getAllByText('1').length).toBeGreaterThan(0);
    expect(within(pausedCard).getAllByText('0').length).toBeGreaterThan(0);
  });

  it('renders containers table with correct data', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Docker operations center'));

    const tableContainer = screen.getByTestId('docker-containers-table');
    expect(within(tableContainer).getByText('web-server')).toBeDefined();
    expect(within(tableContainer).getByText('nginx:latest')).toBeDefined();
    expect(within(tableContainer).getByText('db-server')).toBeDefined();
    expect(within(tableContainer).getByText('postgres:13')).toBeDefined();
  });

  it('expands container row to show details', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Docker operations center'));

    const tableContainer = screen.getByTestId('docker-containers-table');
    const expandButton = within(tableContainer).getByRole('button', { name: /web-server/i });
    await act(async () => {
      fireEvent.click(expandButton);
    });

    expect(screen.getByRole('heading', { name: /Live metrics/i })).toBeDefined();
    expect(screen.getByText(/CPU usage/i)).toBeDefined();
    expect(screen.getByText(/^5\.5%$/)).toBeDefined();
    expect(screen.getByText(/Memory %/i)).toBeDefined();
    expect(screen.getByText(/^12\.0%$/)).toBeDefined();
    expect(screen.getByText('NODE_ENV=production')).toBeDefined();
  });

  it('switches between Image/Volumes/Networks tabs', async () => {
    await renderPage();
    await waitFor(() => screen.getByTestId('docker-assets'));

    // Default is images
    expect(screen.getByTestId('docker-images-table')).toBeDefined();

    // Switch to volumes
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /volumes/i }));
    });
    expect(screen.getByTestId('docker-volumes-table')).toBeDefined();
    expect(screen.getByText('db-data')).toBeDefined();

    // Switch to networks
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /networks/i }));
    });
    await waitFor(() => screen.getByTestId('docker-networks-table'));
    const networksTable = screen.getByTestId('docker-networks-table');
    expect(within(networksTable).getAllByText('bridge').length).toBeGreaterThan(0);
  });

  it('triggers container action: stop', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Docker operations center'));

    const tableContainer = screen.getByTestId('docker-containers-table');
    const stopButton = within(tableContainer).getAllByRole('button', { name: /Stop/i })[0];
    await act(async () => {
      fireEvent.click(stopButton);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/docker/container-1/action',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'stop' }),
      })
    );
  });

  it('triggers container action: restart', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Docker operations center'));

    const tableContainer = screen.getByTestId('docker-containers-table');
    const restartButton = within(tableContainer).getAllByRole('button', { name: /Restart/i })[0];
    await act(async () => {
      fireEvent.click(restartButton);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/docker/container-1/action',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'restart' }),
      })
    );
  });

  it('triggers container action: remove', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Docker operations center'));

    const tableContainer = screen.getByTestId('docker-containers-table');
    const removeButtons = within(tableContainer).getAllByRole('button').filter(b => b.querySelector('svg.lucide-trash2') || b.innerHTML.includes('lucide-trash2'));
    
    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to remove this container?');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/docker/container-1/action',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'remove' }),
      })
    );
  });

  it('triggers container logs and exec commands', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Docker operations center'));

    const containersTable = screen.getByTestId('docker-containers-table');
    const logsButton = within(containersTable).getAllByRole('button', { name: 'Logs' })[0];
    const execButton = within(containersTable).getAllByRole('button', { name: 'Exec' })[0];

    await act(async () => {
      fireEvent.click(logsButton);
    });
    expect(screen.getByText('docker logs -f web-server')).toBeDefined();

    await act(async () => {
      fireEvent.click(execButton);
    });
    expect(screen.getByText('docker exec -it web-server sh')).toBeDefined();
  });

  it('triggers container action: start', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Docker operations center'));

    const containersTable = await waitFor(() => screen.getByTestId('docker-containers-table'));
    const container2Row = within(containersTable).getByText('db-server').closest('tr')!;
    const startButton = within(container2Row).getByRole('button', { name: 'Start' });
    await act(async () => {
      fireEvent.click(startButton);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/docker/container-2/action',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'start' }),
      })
    );
  });

  it('triggers asset deletion (image)', async () => {
    await renderPage();
    await waitFor(() => screen.getByTestId('docker-images-table'));

    const imageTable = screen.getByTestId('docker-images-table');
    const deleteButton = within(imageTable)
      .getAllByRole('button')
      .find((b) => b.innerHTML.includes('lucide-trash2'));
    if (!deleteButton) throw new Error('Delete button not found');
    fireEvent.click(deleteButton);

    expect(window.confirm).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/docker/images/image-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('renders charts containers', async () => {
    await renderPage();
    await waitFor(() => screen.getByTestId('docker-resource-chart'));
    expect(screen.getByTestId('docker-disk-chart')).toBeDefined();
    expect(screen.getByTestId('docker-io-chart')).toBeDefined();
    expect(screen.getByTestId('docker-network-chart')).toBeDefined();
  });

  it('renders alerts and events', async () => {
    await renderPage();
    await waitFor(() => screen.getByTestId('docker-alerts'));
    expect(screen.getByText('High CPU')).toBeDefined();
    expect(screen.getByTestId('docker-events')).toBeDefined();
    const eventsSection = screen.getByTestId('docker-events');
    expect(within(eventsSection).getByText('container-1')).toBeDefined();
  });

  it('manual refresh works', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Refresh now'));
    const refreshButton = screen.getByText('Refresh now');
    fireEvent.click(refreshButton);
    expect(global.fetch).toHaveBeenCalledTimes(2); // Initial + Manual
  });

  it('terminal presets change command', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Embedded Docker terminal'));
    const terminalCard = screen.getByTestId('docker-terminal');

    fireEvent.click(within(terminalCard).getByText('Images'));
    expect(screen.getByText('docker images')).toBeDefined();

    fireEvent.click(within(terminalCard).getByText('Compose'));
    expect(screen.getByText('docker compose ps')).toBeDefined();

    fireEvent.click(within(terminalCard).getByText('Containers'));
    expect(screen.getByText('docker ps -a')).toBeDefined();

    fireEvent.click(within(terminalCard).getByText('CRI'));
    expect(screen.getByText('crictl ps -a')).toBeDefined();
  });

  it('handles fetch error gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'API Error' }),
    });

    await renderPage();
    await waitFor(() => screen.queryByTestId('page-skeleton') === null);
  });

  it('changes container for IO chart', async () => {
    await renderPage();
    await waitFor(() => screen.getByTestId('docker-io-chart'));

    const chartCard = screen.getByTestId('docker-io-chart');
    const select = within(chartCard).getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'container-2' } });
    });
    expect(select).toHaveValue('container-2');
  });

  describe.skip('Polling', () => {
    it('automatically polls for updates', async () => {
      vi.useFakeTimers();
      await renderPage();
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      vi.mocked(global.fetch).mockClear();

      await act(async () => {
        vi.advanceTimersByTime(5010);
        vi.runOnlyPendingTimers();
      });

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });

    it('changes polling frequency', async () => {
      vi.useFakeTimers();
      await renderPage();
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      vi.mocked(global.fetch).mockClear();

      const refreshSelect = screen.getByRole('combobox', { name: /^Refresh$/i });
      await act(async () => {
        fireEvent.change(refreshSelect, { target: { value: '2000' } });
      });

      await act(async () => {
        vi.advanceTimersByTime(2010);
        vi.runOnlyPendingTimers();
      });

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });
  });
});
