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

  it('remove rule removes from list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ node: nodeWithRules }),
      })
    );

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
