import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { RotateTokenFlow, RotateTokenResultPanel } from './RotateTokenFlow';

const NODES_RESPONSE = {
  nodes: [
    { _id: 'n1', name: 'Edge Alpha', slug: 'edge-alpha' },
    { _id: 'n2', name: 'Edge Beta', slug: 'edge-beta' },
  ],
  total: 2,
};

describe('RotateTokenFlow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns null when closed', () => {
    const onClose = vi.fn();
    const onResult = vi.fn();
    const { container } = render(
      <RotateTokenFlow open={false} onClose={onClose} onResult={onResult} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('loads nodes, filters via search, submits, and reports result', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/fleet/nodes')) {
        return { ok: true, json: async () => NODES_RESPONSE };
      }
      if (url === '/api/fleet/emergency' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ pairingToken: 'brand-new-token-xyz' }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const onClose = vi.fn();
    const onResult = vi.fn();

    await act(async () => {
      render(<RotateTokenFlow open onClose={onClose} onResult={onResult} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Edge Alpha')).toBeDefined();
      expect(screen.getByText('Edge Beta')).toBeDefined();
    });

    // Search narrows list
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search nodes'), { target: { value: 'alpha' } });
    });
    await waitFor(() => {
      expect(screen.queryByText('Edge Beta')).toBeNull();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Edge Alpha'));
    });

    // Submit guarded by reason length
    const rotate = screen.getByRole('button', { name: 'Rotate token' }) as HTMLButtonElement;
    expect(rotate.disabled).toBe(true);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'Token compromised, rotate now' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    });

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith({
        nodeId: 'n1',
        slug: 'edge-alpha',
        name: 'Edge Alpha',
        newToken: 'brand-new-token-xyz',
      });
      expect(onClose).toHaveBeenCalled();
    });

    const emergencyCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/fleet/emergency' &&
        (init as { method?: string } | undefined)?.method === 'POST'
    );
    expect(emergencyCall).toBeDefined();
    if (emergencyCall) {
      const body = JSON.parse(String((emergencyCall[1] as RequestInit).body));
      expect(body).toMatchObject({
        action: 'rotate_token',
        targetId: 'n1',
        confirm: true,
      });
    }
  });

  it('surfaces API errors without closing modal', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/fleet/nodes')) {
        return { ok: true, json: async () => NODES_RESPONSE };
      }
      if (url === '/api/fleet/emergency' && init?.method === 'POST') {
        return { ok: false, json: async () => ({ error: 'Boom' }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const onClose = vi.fn();
    const onResult = vi.fn();

    await act(async () => {
      render(<RotateTokenFlow open onClose={onClose} onResult={onResult} />);
    });

    await waitFor(() => screen.getByText('Edge Alpha'));
    await act(async () => {
      fireEvent.click(screen.getByText('Edge Alpha'));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'Requires fresh token for audit' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Boom')).toBeDefined();
    });
    expect(onResult).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('RotateTokenResultPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders token with one-time warning and copies to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const onDismiss = vi.fn();
    render(
      <RotateTokenResultPanel
        result={{
          nodeId: 'n1',
          slug: 'edge-alpha',
          name: 'Edge Alpha',
          newToken: 'plaintext-secret-value',
        }}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('New token for edge-alpha')).toBeDefined();
    expect(screen.getByTestId('rotate-token-value').textContent).toBe('plaintext-secret-value');
    expect(screen.getByText(/only be shown once/i)).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy token' }));
    });
    expect(writeText).toHaveBeenCalledWith('plaintext-secret-value');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss token' }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
