import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LogsPage from './LogsPage';

const mockLogs = [
  {
    _id: '1',
    moduleId: 'users',
    event: 'User admin created',
    severity: 'info',
    timestamp: new Date().toISOString(),
    metadata: { user: 'admin' },
  },
  {
    _id: '2',
    moduleId: 'docker',
    event: 'Disk space warning',
    severity: 'warn',
    timestamp: new Date().toISOString(),
    metadata: { usage: '85%' },
  },
  {
    _id: '3',
    moduleId: 'system',
    event: 'Service failure',
    severity: 'error',
    timestamp: new Date().toISOString(),
    metadata: { service: 'nginx' },
  },
];

describe('LogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ events: mockLogs }),
      } as Response)
    );
  });

  const renderPage = async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<LogsPage />);
    });
    return result!;
  };

  it('renders logs in table after loading', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('User admin created').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Disk space warning').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Service failure').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('filters logs by search query', async () => {
    await renderPage();
    const searchInput = screen.getByRole('textbox', { name: 'Search logs' });

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'admin' } });
    });

    await waitFor(() => {
      expect(screen.getAllByText('User admin created').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Disk space warning')).toBeNull();
      expect(screen.queryByText('Service failure')).toBeNull();
    });
  });

  it('filters logs by severity buttons', async () => {
    await renderPage();
    const warnButton = screen.getByRole('button', { name: 'Warn' });

    await act(async () => {
      fireEvent.click(warnButton);
    });

    await waitFor(() => {
      expect(screen.getAllByText('Disk space warning').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('User admin created')).toBeNull();
      expect(screen.queryByText('Service failure')).toBeNull();
    });
    expect(warnButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders "No matching logs found" when filters yield no results', async () => {
    await renderPage();
    const searchInput = screen.getByRole('textbox', { name: 'Search logs' });

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
    });

    await waitFor(() => {
      expect(screen.getByText('No matching logs found')).toBeTruthy();
    });
  });

  it('handles loading state', async () => {
    let resolveFetch: (value: Response | PromiseLike<Response>) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<LogsPage />);
    expect(screen.getByRole('status')).toBeTruthy();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ events: mockLogs }),
      } as Response);
    });

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});
