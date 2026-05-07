import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DatabasesWidget from './DatabasesWidget';

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
    expect(screen.getByText('1 public')).toBeTruthy();
    expect(screen.getByText('Main Postgres')).toBeTruthy();
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/databases');
  });
});
