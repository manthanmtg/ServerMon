import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DatabasesWidget, { deriveDatabaseWidgetSummary } from './DatabasesWidget';

describe('DatabasesWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        databases: [
          { id: 'db-1', name: 'Main Postgres', status: 'running', publicRoute: false },
          { id: 'db-2', name: 'Public Mongo', status: 'failed', publicRoute: true },
        ],
      }),
    } as Response);
  });

  it('summarizes database fleet health and links to the module', async () => {
    render(<DatabasesWidget />);

    await waitFor(() => expect(screen.getByText('Databases')).toBeTruthy());
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('public')).toBeTruthy();
    expect(screen.getByText('Main Postgres')).toBeTruthy();
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/databases');
  });

  it('derives widget summary counts in one reusable pass', () => {
    const summary = deriveDatabaseWidgetSummary([
      { status: 'running', publicRoute: false },
      { status: 'failed', publicRoute: true },
      { status: 'running', publicRoute: true },
    ]);

    expect(summary).toEqual({
      running: 2,
      failed: 1,
      publicCount: 2,
    });
  });
});
