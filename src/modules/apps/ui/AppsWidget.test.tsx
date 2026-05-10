import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppsWidget, { deriveAppsWidgetSummary } from './AppsWidget';

describe('AppsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apps: [
          { id: 'app-1', name: 'Portal', domain: 'portal.example.com', status: 'running' },
          { id: 'app-2', name: 'Worker', domain: 'worker.example.com', status: 'deploying' },
          { id: 'app-3', name: 'Broken', domain: 'broken.example.com', status: 'failed' },
        ],
      }),
    } as Response);
  });

  it('summarizes app fleet health and links to the module', async () => {
    render(<AppsWidget />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Apps' })).toBeTruthy());
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('Attention')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Portal')).toBeTruthy();
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/apps');
  });

  it('derives widget summary counts in one reusable pass', () => {
    const summary = deriveAppsWidgetSummary([
      { status: 'running' },
      { status: 'deploying' },
      { status: 'failed' },
      { status: 'running' },
    ]);

    expect(summary).toEqual({
      running: 2,
      failed: 1,
      deploying: 1,
    });
  });
});
