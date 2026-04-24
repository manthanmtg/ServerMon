import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { GeneratedDocsView } from './GeneratedDocsView';

describe('GeneratedDocsView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders node docs', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/fleet/nodes/n1') {
        return {
          ok: true,
          json: async () => ({
            node: {
              _id: 'n1',
              name: 'Edge',
              slug: 'edge',
              status: 'online',
              tunnelStatus: 'connected',
              description: 'Edge node in region A',
              tags: ['prod'],
              proxyRules: [],
            },
            computedStatus: 'online',
          }),
        };
      }
      if (url.includes('/api/fleet/revisions')) {
        return {
          ok: true,
          json: async () => ({
            revisions: [
              {
                _id: 'rev1',
                kind: 'frpc',
                version: 3,
                hash: 'abcd',
                createdAt: new Date().toISOString(),
              },
            ],
          }),
        };
      }
      if (url.startsWith('/api/fleet/logs')) {
        return { ok: true, json: async () => ({ events: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<GeneratedDocsView kind="node" nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Edge node in region A')).toBeDefined();
    });
    expect(screen.getByText('prod')).toBeDefined();
  });

  it('renders route docs', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/fleet/routes/r1') {
        return {
          ok: true,
          json: async () => ({
            route: {
              _id: 'r1',
              name: 'App',
              slug: 'app',
              domain: 'app.example.com',
              nodeId: 'n1',
              target: { localIp: '127.0.0.1', localPort: 8080, protocol: 'http' },
              accessMode: 'servermon_auth',
              tlsEnabled: true,
            },
          }),
        };
      }
      if (url.includes('/api/fleet/revisions')) {
        return { ok: true, json: async () => ({ revisions: [] }) };
      }
      return { ok: true, json: async () => ({ events: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<GeneratedDocsView kind="route" routeId="r1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('app.example.com')).toBeDefined();
    });
  });

  it('downloads node docs as markdown blob when clicking the download button', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/fleet/nodes/n1') {
        return {
          ok: true,
          json: async () => ({
            node: {
              _id: 'n1',
              name: 'Edge',
              slug: 'edge-01',
              status: 'online',
              tunnelStatus: 'connected',
              description: 'Edge node',
              tags: ['prod'],
              proxyRules: [],
            },
          }),
        };
      }
      if (url.includes('/api/fleet/revisions')) {
        return { ok: true, json: async () => ({ revisions: [] }) };
      }
      return { ok: true, json: async () => ({ events: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const createObjectUrl = vi.fn((_blob: Blob) => 'blob:node');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });

    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'a') {
          (el as HTMLAnchorElement).click = anchorClick;
        }
        return el;
      });

    await act(async () => {
      render(<GeneratedDocsView kind="node" nodeId="n1" />);
    });

    const btn = await screen.findByRole('button', { name: /download node docs as markdown/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = createObjectUrl.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain('text/markdown');
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);

    createElementSpy.mockRestore();
  });

  it('downloads route docs as markdown blob when clicking the download button', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/fleet/routes/r1') {
        return {
          ok: true,
          json: async () => ({
            route: {
              _id: 'r1',
              name: 'App',
              slug: 'app-route',
              domain: 'app.example.com',
              nodeId: 'n1',
              target: { localIp: '127.0.0.1', localPort: 8080, protocol: 'http' },
              accessMode: 'servermon_auth',
              tlsEnabled: true,
            },
          }),
        };
      }
      if (url.includes('/api/fleet/revisions')) {
        return { ok: true, json: async () => ({ revisions: [] }) };
      }
      return { ok: true, json: async () => ({ events: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const createObjectUrl = vi.fn((_blob: Blob) => 'blob:route');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });

    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'a') {
          (el as HTMLAnchorElement).click = anchorClick;
        }
        return el;
      });

    await act(async () => {
      render(<GeneratedDocsView kind="route" routeId="r1" />);
    });

    const btn = await screen.findByRole('button', { name: /download route docs as markdown/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = createObjectUrl.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain('text/markdown');
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);

    createElementSpy.mockRestore();
  });
});
