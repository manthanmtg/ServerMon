import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import CronsPage from './CronsPage';
import { ToastProvider } from '@/components/ui/toast';

const mockCronsSnapshot = {
  jobs: [
    { 
      id: 'job1', 
      user: 'root', 
      minute: '0', 
      hour: '0', 
      dayOfMonth: '*', 
      month: '*', 
      dayOfWeek: '*', 
      command: 'echo "hello"', 
      source: 'user', 
      enabled: true, 
      expression: '0 0 * * *', 
      nextRuns: [new Date(Date.now() + 60000).toISOString()],
      comment: 'Test job'
    },
    { 
      id: 'job2', 
      user: 'www-data', 
      minute: '*/5', 
      hour: '*', 
      dayOfMonth: '*', 
      month: '*', 
      dayOfWeek: '*', 
      command: 'php artisan schedule:run', 
      source: 'user', 
      enabled: true, 
      expression: '*/5 * * * *', 
      nextRuns: [new Date(Date.now() + 300000).toISOString()] 
    }
  ],
  summary: { total: 2, active: 2, disabled: 0, userCrons: 2, systemCrons: 0 },
  systemDirs: [],
  recentLogs: [],
  crontabAvailable: true,
  source: 'crontab',
  cronRuns: []
};

vi.mock('@/components/layout/ProShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="pro-shell">{children}</div>
}));

describe('CronsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/run')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes('api/modules/crons')) {
        return Promise.resolve({ ok: true, json: async () => mockCronsSnapshot });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  const renderPage = async () => {
    await act(async () => {
      render(
        <ToastProvider>
          <CronsPage />
        </ToastProvider>
      );
    });
  };

  it('renders stats correctly', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getAllByText('2').length).toBeGreaterThan(0));
  });

  it('renders job list', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText('echo "hello"')).toBeDefined());
    expect(screen.getByText('php artisan schedule:run')).toBeDefined();
  });

  it('filters by search', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('echo "hello"'));
    const searchInput = screen.getByPlaceholderText(/Search/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'artisan' } });
    });
    expect(screen.queryByText('echo "hello"')).toBeNull();
    expect(screen.getByText('php artisan schedule:run')).toBeDefined();
  });

  it('filters by status', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('echo "hello"'));
    const statusSelect = screen.getByDisplayValue('All status');
    await act(async () => {
      fireEvent.change(statusSelect, { target: { value: 'disabled' } });
    });
    expect(screen.queryByText('echo "hello"')).toBeNull();
  });

  it('opens add modal', async () => {
    await renderPage();
    const addBtn = screen.getByText('New Job');
    await act(async () => {
      fireEvent.click(addBtn);
    });
    expect(screen.getByText('Create Cron Job')).toBeDefined();
  });

  it('handles job toggle via PUT', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('echo "hello"'));
    const row = screen.getByText('echo "hello"').closest('tr')!;
    const toggleBtn = within(row).getByTitle('Disable');
    await act(async () => {
      fireEvent.click(toggleBtn);
    });
    // Click confirm in modal
    const confirmBtn = await waitFor(() => within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable' }));
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('job1'),
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('handles job deletion', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('echo "hello"'));
    const row = screen.getByText('echo "hello"').closest('tr')!;
    const deleteBtn = within(row).getByTitle('Delete');
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    // Click confirm in modal
    const confirmBtn = await waitFor(() => within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('job1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('switches to manual run tab', async () => {
    await renderPage();
    const manualTab = screen.getByText('manual run history');
    await act(async () => {
      fireEvent.click(manualTab);
    });
    expect(screen.getByText('Manual Execution History')).toBeDefined();
  });

  it('switches to execution logs tab', async () => {
    await renderPage();
    const logsTab = screen.getByText('system logs');
    await act(async () => {
      fireEvent.click(logsTab);
    });
    expect(screen.getByText('Recent System Cron Logs')).toBeDefined();
  });

  it('handles manual refresh', async () => {
    await renderPage();
    const refreshBtn = screen.getByText('Refresh now');
    await act(async () => {
      fireEvent.click(refreshBtn);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('renders presets in builder', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByText('New Job')); });
    await act(async () => { fireEvent.click(screen.getByText('Presets')); });
    expect(screen.getByText('Every minute')).toBeDefined();
  });

  it('handles next runs view', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('echo "hello"'));
    const row = screen.getByText('echo "hello"').closest('tr')!;
    const expandBtn = within(row).getAllByRole('button')[0];
    await act(async () => {
      fireEvent.click(expandBtn);
    });
    expect(screen.getByText('Next 5 runs')).toBeDefined();
  });

  it('handles sort by command', async () => {
    await renderPage();
    const header = screen.getByText('Command');
    await act(async () => {
      fireEvent.click(header);
    });
    // Toggle sort
    await act(async () => {
      fireEvent.click(header);
    });
    expect(screen.getByText('echo "hello"')).toBeDefined();
  });

  it('filters by source', async () => {
    await renderPage();
    const sourceSelect = screen.getByDisplayValue('All sources');
    await act(async () => {
      fireEvent.change(sourceSelect, { target: { value: 'user' } });
    });
    expect(screen.getByText('echo "hello"')).toBeDefined();
  });
});
