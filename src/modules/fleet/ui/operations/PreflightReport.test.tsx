import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { PreflightReport } from './PreflightReport';

describe('PreflightReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders idle then runs preflight and shows results', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'mongo.connection',
                label: 'MongoDB connection',
                status: 'skip',
                detail: 'pending-phase-2',
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<PreflightReport />);
    });

    expect(screen.getByText('Run preflight')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Run preflight'));
    });

    await waitFor(() => {
      expect(screen.getByText('MongoDB connection')).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/fleet/server/preflight',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
