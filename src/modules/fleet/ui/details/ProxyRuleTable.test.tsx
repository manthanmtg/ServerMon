import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { ProxyRuleTable } from './ProxyRuleTable';

const nodeWithRules = {
  _id: 'n1',
  name: 'Edge',
  slug: 'edge-01',
  proxyRules: [
    {
      name: 'web',
      type: 'http',
      localIp: '127.0.0.1',
      localPort: 8080,
      enabled: true,
      status: 'active',
    },
  ],
};

describe('ProxyRuleTable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows spinner then renders existing proxy rules', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ node: nodeWithRules, computedStatus: 'online' }),
      })
    );

    await act(async () => {
      render(<ProxyRuleTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('web')).toBeDefined();
    });
    expect(screen.getByDisplayValue('127.0.0.1')).toBeDefined();
    expect(screen.getByDisplayValue(8080)).toBeDefined();
    expect(screen.getByText('active')).toBeDefined();
  });

  it('add rule appends a new rule row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ node: { ...nodeWithRules, proxyRules: [] } }),
      })
    );

    await act(async () => {
      render(<ProxyRuleTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Add rule')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add rule'));
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('rule-1')).toBeDefined();
    });
  });

  it('suggests a TCP proxy rule for detected databases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          node: {
            ...nodeWithRules,
            proxyRules: [],
            servermonBridge: {
              routeCandidates: [
                {
                  id: 'database:db-1',
                  kind: 'database',
                  name: 'Main Mongo',
                  status: 'running',
                  target: { localIp: '127.0.0.1', localPort: 27017, protocol: 'tcp' },
                  route: {
                    eligible: true,
                    proxyRuleName: 'main-mongo',
                  },
                  metadata: {
                    database: { engine: 'mongo' },
                  },
                },
              ],
            },
          },
        }),
      })
    );

    await act(async () => {
      render(<ProxyRuleTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Detected proxy candidates')).toBeDefined();
    });
    expect(screen.getByText('Main Mongo')).toBeDefined();
    expect(screen.getByText('127.0.0.1:27017')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add proxy for Main Mongo' }));
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('main-mongo')).toBeDefined();
    });
    expect(screen.getByDisplayValue('127.0.0.1')).toBeDefined();
    expect(screen.getByDisplayValue(27017)).toBeDefined();
    const remotePort = screen.getByLabelText('Rule 1 remote port') as HTMLInputElement;
    expect(Number(remotePort.value)).toBeGreaterThanOrEqual(9000);
    expect(Number(remotePort.value)).toBeLessThan(19000);
  });

  it('does not suggest a detected database that already has a matching proxy rule', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          node: {
            ...nodeWithRules,
            proxyRules: [
              {
                name: 'main-mongo',
                type: 'tcp',
                localIp: '127.0.0.1',
                localPort: 27017,
                remotePort: 12316,
                enabled: true,
              },
            ],
            servermonBridge: {
              routeCandidates: [
                {
                  id: 'database:db-1',
                  kind: 'database',
                  name: 'Main Mongo',
                  status: 'running',
                  target: { localIp: '127.0.0.1', localPort: 27017, protocol: 'tcp' },
                  route: {
                    eligible: true,
                    proxyRuleName: 'main-mongo',
                  },
                  metadata: {
                    database: { engine: 'mongo' },
                  },
                },
              ],
            },
          },
        }),
      })
    );

    await act(async () => {
      render(<ProxyRuleTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('main-mongo')).toBeDefined();
    });
    expect(screen.queryByText('Detected proxy candidates')).toBeNull();
  });

  it('remove rule persists and removes from list', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ node: { ...nodeWithRules, proxyRules: [] } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ node: nodeWithRules }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ProxyRuleTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('web')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove rule 1'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            typeof url === 'string' &&
            url.endsWith('/api/fleet/nodes/n1') &&
            (init as { method?: string } | undefined)?.method === 'PATCH' &&
            String((init as { body?: string } | undefined)?.body).includes('"proxyRules":[]')
        )
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByDisplayValue('web')).toBeNull();
    });
  });

  it('save changes PATCHes proxyRules', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ node: nodeWithRules }),
        };
      }
      return {
        ok: true,
        json: async () => ({ node: nodeWithRules }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ProxyRuleTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Save changes')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save changes'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            typeof url === 'string' &&
            url.endsWith('/api/fleet/nodes/n1') &&
            (init as { method?: string } | undefined)?.method === 'PATCH'
        )
      ).toBe(true);
    });
  });
});
