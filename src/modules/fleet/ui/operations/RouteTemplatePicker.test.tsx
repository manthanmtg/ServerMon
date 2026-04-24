import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { RouteTemplatePicker } from './RouteTemplatePicker';

describe('RouteTemplatePicker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders builtin templates from fetch', async () => {
    const templates = [
      {
        _id: 't1',
        name: 'Generic HTTP',
        slug: 'generic-http',
        kind: 'builtin',
        description: 'Baseline',
        defaults: {
          protocol: 'http',
          websocket: false,
          timeoutSec: 60,
          uploadBodyMb: 32,
          headers: {},
          accessMode: 'servermon_auth',
          logLevel: 'info',
        },
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ templates }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<RouteTemplatePicker />);
    });

    await waitFor(() => {
      expect(screen.getByText('Generic HTTP')).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/fleet/templates');
  });

  it('opens new template form when clicking New template', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ templates: [] }),
      })
    );

    await act(async () => {
      render(<RouteTemplatePicker />);
    });

    await waitFor(() => {
      expect(screen.getByText('New template')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('New template'));
    });

    await waitFor(() => {
      expect(screen.getByText('Save template')).toBeDefined();
    });
  });
});
