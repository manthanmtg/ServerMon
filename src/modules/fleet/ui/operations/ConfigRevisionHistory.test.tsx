import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import { ConfigRevisionHistory } from './ConfigRevisionHistory';

describe('ConfigRevisionHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches and renders revisions', async () => {
    const revisions = [
      {
        _id: 'rv1',
        kind: 'nginx',
        targetId: 'r1',
        version: 2,
        hash: 'abcdef0123456789',
        createdAt: new Date().toISOString(),
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ revisions, total: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ConfigRevisionHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('v2')).toBeDefined();
    });
    expect(
      fetchMock.mock.calls.some(
        ([url]) => typeof url === 'string' && url.startsWith('/api/fleet/revisions')
      )
    ).toBe(true);
  });

  it('View opens detail panel with metadata and rendered content', async () => {
    const revisions = [
      {
        _id: 'rv1',
        kind: 'frpc',
        targetId: 'n1',
        version: 3,
        hash: 'abcdef0123456789aa',
        rendered: 'bind_port = 7000',
        createdBy: 'alice',
        createdAt: '2024-01-02T03:04:05Z',
        appliedAt: '2024-01-02T03:10:00Z',
      },
      {
        _id: 'rv0',
        kind: 'frpc',
        targetId: 'n1',
        version: 2,
        hash: 'aa',
        rendered: 'old',
      },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/rv1')) {
        return {
          ok: true,
          json: async () => ({ revision: revisions[0] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ revisions, total: revisions.length }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ConfigRevisionHistory />);
    });

    await waitFor(() => {
      expect(screen.getAllByText('View').length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getAllByText('View')[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/bind_port = 7000/)).toBeDefined();
    });

    const meta = screen.getByTestId('revision-metadata');
    const metaScope = within(meta);
    expect(metaScope.getByText('alice')).toBeDefined();
    expect(metaScope.getByText('n1')).toBeDefined();
    // First 12 chars of hash
    expect(metaScope.getByText('abcdef012345')).toBeDefined();
  });

  it('renders diff lines with +/- coloring', async () => {
    const revisions = [
      {
        _id: 'rv1',
        kind: 'nginx',
        targetId: 't1',
        version: 2,
        hash: 'a'.repeat(20),
        rendered: 'content',
        diffFromPrevious: '+ foo\n- bar\n  unchanged',
      },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/rv1')) {
        return {
          ok: true,
          json: async () => ({ revision: revisions[0] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ revisions, total: 1 }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ConfigRevisionHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('View')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('View'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('revision-diff')).toBeDefined();
    });

    const diff = screen.getByTestId('revision-diff');
    const lines = diff.querySelectorAll('span');
    expect(lines.length).toBe(3);
    // "+ foo" → success
    expect(lines[0].className).toContain('text-success');
    expect(lines[0].textContent).toContain('+ foo');
    // "- bar" → destructive
    expect(lines[1].className).toContain('text-destructive');
    expect(lines[1].textContent).toContain('- bar');
    // "  unchanged" → default
    expect(lines[2].className).toContain('text-foreground');
    expect(lines[2].className).not.toContain('text-success');
    expect(lines[2].className).not.toContain('text-destructive');
  });

  it('Apply button POSTs to apply endpoint and refreshes list', async () => {
    const revisions = [
      {
        _id: 'rv1',
        kind: 'frps',
        version: 1,
        hash: 'abcdef012345',
        rendered: 'cfg',
      },
    ];
    const postUrls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        postUrls.push(url);
        return {
          ok: true,
          json: async () => ({ result: { ok: true } }),
        };
      }
      if (url.endsWith('/rv1')) {
        return {
          ok: true,
          json: async () => ({ revision: revisions[0] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ revisions, total: 1 }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ConfigRevisionHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('View')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('View'));
    });
    await waitFor(() => {
      expect(screen.getByText('Apply')).toBeDefined();
    });

    const listFetchesBefore = fetchMock.mock.calls.filter(
      ([url]) =>
        typeof url === 'string' && url.startsWith('/api/fleet/revisions?') && !url.includes('/rv1')
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByText('Apply'));
    });

    await waitFor(() => {
      expect(postUrls).toContain('/api/fleet/revisions/rv1/apply');
    });

    // Success confirmation shown.
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/Applied/);
    });

    // List re-fetched.
    await waitFor(() => {
      const listFetchesAfter = fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === 'string' &&
          url.startsWith('/api/fleet/revisions?') &&
          !url.includes('/rv1')
      ).length;
      expect(listFetchesAfter).toBeGreaterThan(listFetchesBefore);
    });
  });

  it('Apply button is disabled when revision already appliedAt', async () => {
    const revisions = [
      {
        _id: 'rv1',
        kind: 'frps',
        version: 1,
        hash: 'abcdef012345',
        rendered: 'cfg',
        appliedAt: '2024-01-01T00:00:00Z',
      },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/rv1')) {
        return {
          ok: true,
          json: async () => ({ revision: revisions[0] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ revisions, total: 1 }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ConfigRevisionHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('View')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('View'));
    });

    await waitFor(() => {
      const btn = screen.getByText('Apply').closest('button') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  it('Rollback button POSTs to rollback endpoint', async () => {
    const revisions = [
      {
        _id: 'rv2',
        kind: 'frpc',
        targetId: 'n1',
        version: 2,
        hash: 'b'.repeat(20),
        rendered: 'new',
      },
      {
        _id: 'rv1',
        kind: 'frpc',
        targetId: 'n1',
        version: 1,
        hash: 'a'.repeat(20),
        rendered: 'old',
      },
    ];
    const postUrls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        postUrls.push(url);
        return {
          ok: true,
          json: async () => ({ rollbackRevision: { id: 'new' } }),
        };
      }
      if (url.endsWith('/rv1')) {
        return {
          ok: true,
          json: async () => ({ revision: revisions[1] }),
        };
      }
      if (url.endsWith('/rv2')) {
        return {
          ok: true,
          json: async () => ({ revision: revisions[0] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ revisions, total: revisions.length }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ConfigRevisionHistory />);
    });

    await waitFor(() => {
      expect(screen.getAllByText('View').length).toBe(2);
    });

    // Click the second row's View (rv1 - older revision, not the latest).
    await act(async () => {
      fireEvent.click(screen.getAllByText('View')[1]);
    });
    await waitFor(() => {
      expect(screen.getByText('Rollback')).toBeDefined();
    });

    const rollbackBtn = screen.getByText('Rollback').closest('button') as HTMLButtonElement;
    expect(rollbackBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(rollbackBtn);
    });

    // Confirmation modal appears.
    await waitFor(() => {
      expect(screen.getByText(/Rolling back creates a new revision/)).toBeDefined();
    });

    // Click the confirm button in the modal. The modal renders a button labeled
    // "Rollback" (separate from the trigger button) with a role of button.
    const modalButtons = screen.getAllByRole('button', { name: 'Rollback' });
    const confirmButton = modalButtons[modalButtons.length - 1];
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(postUrls).toContain('/api/fleet/revisions/rv1/rollback');
    });
  });

  it('Rollback button is disabled when revision IS latest for (kind, targetId)', async () => {
    const revisions = [
      {
        _id: 'rv2',
        kind: 'frpc',
        targetId: 'n1',
        version: 2,
        hash: 'b'.repeat(20),
        rendered: 'new',
      },
      {
        _id: 'rv1',
        kind: 'frpc',
        targetId: 'n1',
        version: 1,
        hash: 'a'.repeat(20),
        rendered: 'old',
      },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/rv2')) {
        return {
          ok: true,
          json: async () => ({ revision: revisions[0] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ revisions, total: revisions.length }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ConfigRevisionHistory />);
    });

    await waitFor(() => {
      expect(screen.getAllByText('View').length).toBe(2);
    });

    // Click the first row (rv2 - the latest).
    await act(async () => {
      fireEvent.click(screen.getAllByText('View')[0]);
    });
    await waitFor(() => {
      expect(screen.getByText('Rollback')).toBeDefined();
    });

    const rollbackBtn = screen.getByText('Rollback').closest('button') as HTMLButtonElement;
    expect(rollbackBtn.disabled).toBe(true);
  });
});
