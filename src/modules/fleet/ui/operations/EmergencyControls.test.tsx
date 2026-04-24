import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { EmergencyControls } from './EmergencyControls';

const NODES_RESPONSE = {
  nodes: [
    { _id: 'n1', name: 'Edge Alpha', slug: 'edge-alpha' },
    { _id: 'n2', name: 'Edge Beta', slug: 'edge-beta' },
  ],
  total: 2,
};

function makeFetchMock(
  overrides: Partial<{
    rotateTokenResponse: Record<string, unknown>;
    rotateAllResponse: Record<string, unknown>;
    emergencyOk: boolean;
  }> = {}
) {
  const rotateTokenResponse = overrides.rotateTokenResponse ?? {
    action: 'rotate_token',
    completed: true,
    blastRadius: { affectedNodes: 1, affectedTokens: 1 },
    pairingToken: 'new-token-1111',
  };
  const rotateAllResponse = overrides.rotateAllResponse ?? {
    action: 'rotate_all_tokens',
    completed: true,
    blastRadius: { affectedNodes: 2, affectedTokens: 2 },
    tokens: [
      { nodeId: 'n1', pairingToken: 'tok-alpha' },
      { nodeId: 'n2', pairingToken: 'tok-beta' },
    ],
  };
  const emergencyOk = overrides.emergencyOk ?? true;

  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/fleet/nodes')) {
      return { ok: true, json: async () => NODES_RESPONSE };
    }
    if (url.startsWith('/api/fleet/logs')) {
      return { ok: true, json: async () => ({ events: [] }) };
    }
    if (url === '/api/fleet/emergency' && init?.method === 'POST') {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (!emergencyOk) {
        return { ok: false, json: async () => ({ error: 'Server failed' }) };
      }
      if (body.action === 'rotate_token') {
        return { ok: true, json: async () => rotateTokenResponse };
      }
      if (body.action === 'rotate_all_tokens') {
        return { ok: true, json: async () => rotateAllResponse };
      }
      return { ok: true, json: async () => ({ completed: true, blastRadius: {} }) };
    }
    return { ok: true, json: async () => ({}) };
  });
}

describe('EmergencyControls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders action grid including rotate tiles', async () => {
    vi.stubGlobal('fetch', makeFetchMock());

    await act(async () => {
      render(<EmergencyControls />);
    });

    await waitFor(() => {
      expect(screen.getByText('Disable all routes')).toBeDefined();
    });
    expect(screen.getByText('Stop FRP server')).toBeDefined();
    expect(screen.getByText('Rotate agent token')).toBeDefined();
    expect(screen.getByText('Rotate ALL agent tokens')).toBeDefined();
  });

  it('clicking Trigger opens confirm; short reason is rejected', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<EmergencyControls />);
    });

    await waitFor(() => {
      expect(screen.getAllByText('Trigger').length).toBeGreaterThan(0);
    });

    const triggers = screen.getAllByText('Trigger');
    await act(async () => {
      fireEvent.click(triggers[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Confirm:/)).toBeDefined();
    });

    const exec = screen.getByText('Execute') as HTMLButtonElement;
    expect(exec.disabled).toBe(true);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Describe why/), {
        target: { value: 'short' },
      });
    });
    expect((screen.getByText('Execute') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Describe why/), {
        target: { value: 'this is a longer reason' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Execute'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === '/api/fleet/emergency' &&
            (init as { method?: string } | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });
  });

  it('rotate single: opens modal, searches nodes, submits, shows token panel', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<EmergencyControls />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Rotate single'));
    });

    // Modal opens and loads nodes
    await waitFor(() => {
      expect(screen.getByText('Edge Alpha')).toBeDefined();
      expect(screen.getByText('Edge Beta')).toBeDefined();
    });

    // Search filters the list
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search nodes'), { target: { value: 'beta' } });
    });
    await waitFor(() => {
      expect(screen.queryByText('Edge Alpha')).toBeNull();
      expect(screen.getByText('Edge Beta')).toBeDefined();
    });

    // Clear search so we can pick Edge Alpha
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search nodes'), { target: { value: '' } });
    });
    await waitFor(() => {
      expect(screen.getByText('Edge Alpha')).toBeDefined();
    });

    // Select Edge Alpha
    await act(async () => {
      fireEvent.click(screen.getByText('Edge Alpha'));
    });

    // Reason + submit
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'Token compromised, rotate now' },
      });
    });

    const rotateButton = screen.getByRole('button', { name: 'Rotate token' }) as HTMLButtonElement;
    expect(rotateButton.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(rotateButton);
    });

    // POST fired with correct payload
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === '/api/fleet/emergency' &&
          (init as { method?: string } | undefined)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      if (postCall) {
        const body = JSON.parse(String((postCall[1] as RequestInit).body));
        expect(body).toMatchObject({
          action: 'rotate_token',
          targetId: 'n1',
          confirm: true,
        });
        expect(body.reason.length).toBeGreaterThanOrEqual(10);
      }
    });

    // Result panel renders with the plaintext token
    await waitFor(() => {
      expect(screen.getByText('New token for edge-alpha')).toBeDefined();
      expect(screen.getByTestId('rotate-token-value').textContent).toBe('new-token-1111');
      expect(screen.getByText(/only be shown once/i)).toBeDefined();
    });
  });

  it('rotate single: copy-to-clipboard works', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await act(async () => {
      render(<EmergencyControls />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Rotate single'));
    });
    await waitFor(() => screen.getByText('Edge Alpha'));
    await act(async () => {
      fireEvent.click(screen.getByText('Edge Alpha'));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'Need a fresh token' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    });

    await waitFor(() => screen.getByTestId('rotate-token-value'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy token' }));
    });

    expect(writeText).toHaveBeenCalledWith('new-token-1111');
  });

  it('rotate all: confirmation shows blast radius, submit renders results table', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<EmergencyControls />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Rotate all'));
    });

    // Blast radius shows node count
    await waitFor(() => {
      expect(screen.getByText(/nodes will be re-tokenised/i)).toBeDefined();
    });

    // Submit disabled until reason >= 10 chars
    const submit = screen.getByRole('button', { name: 'Rotate all tokens' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'Fleet-wide rotation exercise' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rotate all tokens' }));
    });

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === '/api/fleet/emergency' &&
          (init as { method?: string } | undefined)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      if (postCall) {
        const body = JSON.parse(String((postCall[1] as RequestInit).body));
        expect(body).toMatchObject({
          action: 'rotate_all_tokens',
          confirm: true,
        });
      }
    });

    // Results table renders multiple rows with slugs + tokens
    await waitFor(() => {
      expect(screen.getByText('New tokens for 2 nodes')).toBeDefined();
      expect(screen.getByTestId('rotate-all-row-edge-alpha')).toBeDefined();
      expect(screen.getByTestId('rotate-all-row-edge-beta')).toBeDefined();
      expect(screen.getByText('tok-alpha')).toBeDefined();
      expect(screen.getByText('tok-beta')).toBeDefined();
    });
  });

  it('rotate all: copy-all-as-JSON writes every token to clipboard', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await act(async () => {
      render(<EmergencyControls />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Rotate all'));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'Fleet-wide rotation exercise' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rotate all tokens' }));
    });

    await waitFor(() => screen.getByText('New tokens for 2 nodes'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy all tokens as JSON' }));
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeText.mock.calls[0][0]);
    expect(payload).toEqual([
      { nodeId: 'n1', slug: 'edge-alpha', newToken: 'tok-alpha' },
      { nodeId: 'n2', slug: 'edge-beta', newToken: 'tok-beta' },
    ]);
  });
});
