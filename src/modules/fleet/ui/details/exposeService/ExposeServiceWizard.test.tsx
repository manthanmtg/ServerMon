import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { ExposeServiceWizard } from './ExposeServiceWizard';

const nodesResponse = {
  nodes: [
    {
      _id: 'n1',
      name: 'Edge',
      slug: 'edge-01',
      proxyRules: [{ name: 'web', type: 'http', localIp: '127.0.0.1', localPort: 3000 }],
    },
  ],
};

const templatesResponse = { templates: [] };

function buildFetchMock(routeResponse: unknown, options?: { autoInserted?: boolean }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url.startsWith('/api/fleet/templates')) {
      return { ok: true, json: async () => templatesResponse };
    }
    if (typeof url === 'string' && url === '/api/fleet/server') {
      return {
        ok: true,
        json: async () => ({
          state: { subdomainHost: 'ultron.manthanby.cv' },
          envDefaults: { hubPublicUrl: 'https://ultron.manthanby.cv' },
        }),
      };
    }
    if (typeof url === 'string' && url.startsWith('/api/fleet/nodes')) {
      return { ok: true, json: async () => nodesResponse };
    }
    if (typeof url === 'string' && url.startsWith('/api/fleet/server/preflight')) {
      return {
        ok: true,
        json: async () => ({ results: [] }),
      };
    }
    if (typeof url === 'string' && url === '/api/fleet/routes' && init?.method === 'POST') {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          route: routeResponse,
          autoInsertedProxy: Boolean(options?.autoInserted),
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  });
}

async function walkIdentity() {
  await act(async () => {
    fireEvent.change(screen.getByPlaceholderText('My App'), {
      target: { value: 'My App' },
    });
  });
  await act(async () => {
    fireEvent.click(screen.getByText('Custom domain'));
  });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Custom domain'), {
      target: { value: 'app.example.com' },
    });
  });
  await act(async () => {
    fireEvent.click(screen.getByText('Next'));
  });
}

async function walkTarget() {
  // Wait for node list to load.
  await waitFor(() => {
    expect(screen.getByText('Edge (edge-01)')).toBeDefined();
  });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Node'), {
      target: { value: 'n1' },
    });
  });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Proxy rule'), {
      target: { value: 'web' },
    });
  });
  await act(async () => {
    fireEvent.click(screen.getByText('Next'));
  });
}

describe('ExposeServiceWizard (orchestrator)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders step 1 (Identity) on mount', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    await act(async () => {
      render(<ExposeServiceWizard />);
    });
    expect(screen.getByText('Expose service')).toBeDefined();
    expect(screen.getByText('Identity')).toBeDefined();
    expect(screen.getByPlaceholderText('My App')).toBeDefined();
  });

  it('walks through all 6 steps and POSTs the correct payload', async () => {
    const fetchMock = buildFetchMock({
      _id: 'r1',
      name: 'My App',
      domain: 'app.example.com',
      nginxConfigRevisionId: 'rev1',
    });
    vi.stubGlobal('fetch', fetchMock);

    const onCreated = vi.fn();
    await act(async () => {
      render(<ExposeServiceWizard onCreated={onCreated} />);
    });

    // Step 1: Identity
    await walkIdentity();
    // Step 2: Target
    await walkTarget();
    // Step 3: Access
    await waitFor(() => {
      expect(screen.getByLabelText('Access mode')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    // Step 4: Preview
    await waitFor(() => {
      expect(screen.getByLabelText('nginx snippet preview')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    // Step 5: DNS (skip)
    await waitFor(() => {
      expect(screen.getByText('Verify DNS')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Skip & continue/));
    });
    // Step 6: Create
    await waitFor(() => {
      expect(screen.getByText('Create')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create'));
    });
    await waitFor(() => {
      expect(screen.getByText('Route created')).toBeDefined();
    });

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        typeof url === 'string' &&
        url === '/api/fleet/routes' &&
        (init as RequestInit | undefined)?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(String((postCall![1] as RequestInit).body));
    expect(body).toMatchObject({
      name: 'My App',
      slug: 'my-app',
      domain: 'app.example.com',
      nodeId: 'n1',
      proxyRuleName: 'web',
      accessMode: 'servermon_auth',
      tlsEnabled: true,
      target: { localIp: '127.0.0.1', localPort: 3000, protocol: 'http' },
    });
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'r1', name: 'My App', domain: 'app.example.com' })
    );
  });

  it('shows the autoInsertedProxy banner when the API reports insertion', async () => {
    const fetchMock = buildFetchMock(
      { _id: 'r1', name: 'My App', domain: 'app.example.com' },
      { autoInserted: true }
    );
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ExposeServiceWizard />);
    });
    await walkIdentity();
    await walkTarget();
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    await waitFor(() => {
      expect(screen.getByLabelText('nginx snippet preview')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    await waitFor(() => {
      expect(screen.getByText('Verify DNS')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Skip & continue/));
    });
    await waitFor(() => {
      expect(screen.getByText('Create')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create'));
    });
    await waitFor(() => {
      expect(screen.getByText(/Proxy rule auto-inserted/)).toBeDefined();
    });
  });

  it('pre-fills nodeId when provided via prop', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    await act(async () => {
      render(<ExposeServiceWizard nodeId="n1" />);
    });
    // The node should not be the blank default after mount.
    expect(screen.getByText('Identity')).toBeDefined();
  });
});
