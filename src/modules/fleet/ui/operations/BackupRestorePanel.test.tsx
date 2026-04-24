import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { BackupRestorePanel } from './BackupRestorePanel';

describe('BackupRestorePanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders existing backup jobs', async () => {
    const jobs = [
      {
        _id: 'b1',
        type: 'manual',
        scopes: ['nodes', 'publicRoutes'],
        destination: { kind: 'local' },
        status: 'completed',
        sizeBytes: 12345,
        manifestPath: '/tmp/m.json',
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jobs }),
      })
    );

    await act(async () => {
      render(<BackupRestorePanel />);
    });

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeDefined();
    });
    expect(screen.getByText('nodes, publicRoutes')).toBeDefined();
  });

  it('clicking Run backup submits form', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ job: { _id: 'new', status: 'completed' } }),
        };
      }
      return { ok: true, json: async () => ({ jobs: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<BackupRestorePanel />);
    });

    await waitFor(() => {
      expect(screen.getByText('Run backup now')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run backup now'));
    });

    await waitFor(() => {
      expect(screen.getByText('Run backup')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run backup'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === '/api/fleet/backups' &&
            (init as { method?: string } | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });
  });
});
