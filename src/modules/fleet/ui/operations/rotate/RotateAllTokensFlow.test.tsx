import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { RotateAllTokensFlow, RotateAllTokensResultPanel } from './RotateAllTokensFlow';

const NODES_RESPONSE = {
  nodes: [
    { _id: 'n1', name: 'Edge Alpha', slug: 'edge-alpha' },
    { _id: 'n2', name: 'Edge Beta', slug: 'edge-beta' },
  ],
  total: 2,
};

describe('RotateAllTokensFlow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns null when closed', () => {
    const { container } = render(
      <RotateAllTokensFlow open={false} onClose={vi.fn()} onResult={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('loads node count, submits rotation, and emits mapped rows with slugs', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/fleet/nodes')) {
        return { ok: true, json: async () => NODES_RESPONSE };
      }
      if (url === '/api/fleet/emergency' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            tokens: [
              { nodeId: 'n1', pairingToken: 'tok-alpha' },
              { nodeId: 'n2', pairingToken: 'tok-beta' },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const onClose = vi.fn();
    const onResult = vi.fn();

    await act(async () => {
      render(<RotateAllTokensFlow open onClose={onClose} onResult={onResult} />);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/2/).length).toBeGreaterThan(0);
      expect(screen.getByText(/nodes will be re-tokenised/i)).toBeDefined();
    });

    const submit = screen.getByRole('button', { name: 'Rotate all tokens' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'Emergency fleet-wide rotation' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rotate all tokens' }));
    });

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith([
        { nodeId: 'n1', slug: 'edge-alpha', newToken: 'tok-alpha' },
        { nodeId: 'n2', slug: 'edge-beta', newToken: 'tok-beta' },
      ]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('falls back to nodeId when slug is missing', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/fleet/nodes')) {
        return { ok: true, json: async () => ({ nodes: [], total: 1 }) };
      }
      if (url === '/api/fleet/emergency' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            tokens: [{ nodeId: 'orphan', pairingToken: 'solo' }],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const onClose = vi.fn();
    const onResult = vi.fn();

    await act(async () => {
      render(<RotateAllTokensFlow open onClose={onClose} onResult={onResult} />);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'Required emergency rotation' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rotate all tokens' }));
    });

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith([
        { nodeId: 'orphan', slug: 'orphan', newToken: 'solo' },
      ]);
    });
  });

  it('shows error banner without closing on failure', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/fleet/nodes')) {
        return { ok: true, json: async () => NODES_RESPONSE };
      }
      if (url === '/api/fleet/emergency' && init?.method === 'POST') {
        return { ok: false, json: async () => ({ error: 'Server down' }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const onClose = vi.fn();
    const onResult = vi.fn();

    await act(async () => {
      render(<RotateAllTokensFlow open onClose={onClose} onResult={onResult} />);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'Need to rotate for audit' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rotate all tokens' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Server down')).toBeDefined();
    });
    expect(onResult).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('RotateAllTokensResultPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const rows = [
    { nodeId: 'n1', slug: 'edge-alpha', newToken: 'tok-alpha' },
    { nodeId: 'n2', slug: 'edge-beta', newToken: 'tok-beta' },
  ];

  it('renders a row per token with warning and slug', () => {
    render(<RotateAllTokensResultPanel rows={rows} onDismiss={vi.fn()} />);
    expect(screen.getByText('New tokens for 2 nodes')).toBeDefined();
    expect(screen.getByText(/only be shown once/i)).toBeDefined();
    expect(screen.getByTestId('rotate-all-row-edge-alpha')).toBeDefined();
    expect(screen.getByTestId('rotate-all-row-edge-beta')).toBeDefined();
    expect(screen.getByText('tok-alpha')).toBeDefined();
    expect(screen.getByText('tok-beta')).toBeDefined();
  });

  it('copies individual row token', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<RotateAllTokensResultPanel rows={rows} onDismiss={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy token for edge-alpha' }));
    });
    expect(writeText).toHaveBeenCalledWith('tok-alpha');
  });

  it('copies all tokens as JSON payload', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<RotateAllTokensResultPanel rows={rows} onDismiss={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy all tokens as JSON' }));
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(writeText.mock.calls[0][0]);
    expect(parsed).toEqual(rows);
  });
});
