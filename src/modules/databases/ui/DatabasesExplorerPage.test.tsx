import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DatabasesExplorerPage from './DatabasesExplorerPage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('DatabasesExplorerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        explorer: {
          status: 'running',
          kind: 'mongo-express',
          proxyPath: '/api/modules/databases/db-1/explore/proxy/',
        },
      }),
    } as Response);
  });

  it('starts the explorer and embeds the managed proxy in an iframe', async () => {
    render(<DatabasesExplorerPage databaseId="db-1" />);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/modules/databases/db-1/explore', {
        method: 'POST',
      })
    );

    const frame = await screen.findByTitle('Database explorer');
    expect(frame).toHaveAttribute('src', '/api/modules/databases/db-1/explore/proxy/');
  });
});
