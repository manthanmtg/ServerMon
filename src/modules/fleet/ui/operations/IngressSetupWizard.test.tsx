import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { IngressSetupWizard } from './IngressSetupWizard';

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => '/fleet/setup',
  useSearchParams: () => new URLSearchParams(),
}));

function typeInto(el: HTMLElement, value: string) {
  act(() => {
    fireEvent.change(el, { target: { value } });
  });
}

async function renderLoaded() {
  render(<IngressSetupWizard />);
  await waitFor(() => {
    expect(screen.queryByText('Loading existing configuration...')).toBeNull();
  });
}

describe('IngressSetupWizard', () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts on step 1 (Hub URL)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    );
    await renderLoaded();
    expect(screen.getByText('Cloud ingress setup')).toBeDefined();
    expect(screen.getByText('Verify reachability')).toBeDefined();
    expect(screen.getByPlaceholderText('example.com')).toBeDefined();
  });

  it('advances step 1 -> 2 when Next is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    );
    await renderLoaded();
    typeInto(screen.getByPlaceholderText('example.com'), 'example.com');
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    await waitFor(() => {
      expect(screen.getByText('Test permissions')).toBeDefined();
    });
    expect(screen.getByPlaceholderText('/etc/nginx/servermon')).toBeDefined();
  });

  it('Check DNS button on step 4 calls the preflight fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'dns.publicHostname',
            label: 'DNS resolves for public hostname',
            status: 'pass',
            detail: 'records: 1.2.3.4',
          },
          { id: 'frp.binaryPresent', label: 'FRP binary', status: 'skip' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderLoaded();

    // Step 1 -> 2
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    // Step 2 -> 3
    await waitFor(() => {
      expect(screen.getByText('Test permissions')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    // Step 3 -> 4
    await waitFor(() => {
      expect(screen.getByLabelText('TLS provider')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await waitFor(() => {
      expect(screen.getByText('Check DNS')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Check DNS'));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/fleet/server/preflight',
        expect.objectContaining({ method: 'POST' })
      );
    });
    // Filtered: only dns.* results shown
    await waitFor(() => {
      expect(screen.getByText('DNS resolves for public hostname')).toBeDefined();
    });
  });

  it('Complete setup calls PATCH /api/fleet/server and PATCH /api/fleet/nginx', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/fleet/server/preflight') {
        return Promise.resolve({ ok: true, json: async () => ({ results: [] }) });
      }
      if (url === '/api/fleet/server') {
        return Promise.resolve({ ok: true, json: async () => ({ state: {} }) });
      }
      if (url === '/api/fleet/nginx') {
        return Promise.resolve({ ok: true, json: async () => ({ state: {} }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderLoaded();

    // Fill subdomain on step 1
    typeInto(screen.getByPlaceholderText('example.com'), 'example.com');

    // Step 1 -> 2
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    // Step 2 -> 3
    await waitFor(() => {
      expect(screen.getByText('Test permissions')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    // Step 3 -> 4
    await waitFor(() => {
      expect(screen.getByLabelText('TLS provider')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await waitFor(() => {
      expect(screen.getByText('Complete setup')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Complete setup'));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/fleet/server',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/fleet/nginx',
      expect.objectContaining({ method: 'PATCH' })
    );

    // Body check for /api/fleet/server
    const serverCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === '/api/fleet/server' &&
        typeof c[1] === 'object' &&
        c[1] !== null &&
        'method' in c[1] &&
        c[1].method === 'PATCH'
    ) as [string, { body: string }];
    const serverBody = JSON.parse(serverCall[1].body);
    expect(serverBody.subdomainHost).toBe('example.com');
    expect(serverBody.bindPort).toBe(7000);

    // Body check for /api/fleet/nginx
    const nginxCall = fetchMock.mock.calls.find((c: unknown[]) => c[0] === '/api/fleet/nginx') as [
      string,
      { body: string },
    ];
    const nginxBody = JSON.parse(nginxCall[1].body);
    expect(nginxBody.managed).toBe(true);
    expect(nginxBody.managedDir).toBe('/etc/nginx/servermon');
    expect(nginxBody.binaryPath).toBe('nginx');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/fleet');
    });
  });

  it('shows ACME email when letsencrypt is selected and info boxes for other providers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    );
    await renderLoaded();

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    await waitFor(() => {
      expect(screen.getByText('Test permissions')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('TLS provider')).toBeDefined();
    });

    // Default provider is letsencrypt -> email input visible
    expect(screen.getByPlaceholderText('admin@example.com')).toBeDefined();

    // Switch to manual
    act(() => {
      fireEvent.change(screen.getByLabelText('TLS provider'), { target: { value: 'manual' } });
    });
    expect(screen.getByText(/Certificates expected under/i)).toBeDefined();

    // Switch to reverse_proxy
    act(() => {
      fireEvent.change(screen.getByLabelText('TLS provider'), {
        target: { value: 'reverse_proxy' },
      });
    });
    expect(screen.getByText(/Upstream reverse proxy handles TLS/i)).toBeDefined();
  });
});
