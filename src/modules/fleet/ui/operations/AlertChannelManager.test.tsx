import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { AlertChannelManager } from './AlertChannelManager';

describe('AlertChannelManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders existing channels after load', async () => {
    const channels = [
      {
        _id: 'c1',
        name: 'Ops Webhook',
        slug: 'ops-webhook',
        kind: 'webhook',
        config: { url: 'https://example.com/hook' },
        enabled: true,
        minSeverity: 'warn',
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/channels')) {
          return { ok: true, json: async () => ({ channels }) };
        }
        return { ok: true, json: async () => ({ subscriptions: [] }) };
      })
    );

    await act(async () => {
      render(<AlertChannelManager />);
    });

    await waitFor(() => {
      expect(screen.getByText('Ops Webhook')).toBeDefined();
    });
    expect(screen.getByText('webhook')).toBeDefined();
  });

  it('submits new webhook channel via POST', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (init?.method === 'POST' && u.includes('/channels')) {
        return {
          ok: true,
          json: async () => ({ channel: { _id: 'new', name: 'X', slug: 'x' } }),
        };
      }
      if (u.includes('/channels')) {
        return { ok: true, json: async () => ({ channels: [] }) };
      }
      return { ok: true, json: async () => ({ subscriptions: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<AlertChannelManager />);
    });

    await waitFor(() => {
      expect(screen.getByText('New channel')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('New channel'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ops' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'ops' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Webhook URL'), {
        target: { value: 'https://x.example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create channel'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            typeof url === 'string' &&
            url === '/api/fleet/alerts/channels' &&
            (init as RequestInit | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        typeof url === 'string' &&
        url === '/api/fleet/alerts/channels' &&
        (init as RequestInit | undefined)?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.config).toEqual({ url: 'https://x.example.com', method: 'POST' });
  });

  it('sends test alert via POST /api/fleet/alerts/test', async () => {
    const channels = [
      {
        _id: 'c1',
        name: 'Ops',
        slug: 'ops',
        kind: 'webhook',
        config: { url: 'https://x' },
        enabled: true,
        minSeverity: 'warn',
      },
    ];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/test')) {
        return { ok: true, json: async () => ({ ok: true, dispatched: 1 }) };
      }
      if (u.includes('/channels')) {
        return { ok: true, json: async () => ({ channels }) };
      }
      void init;
      return { ok: true, json: async () => ({ subscriptions: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<AlertChannelManager />);
    });

    await waitFor(() => {
      expect(screen.getByText('Send test')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Send test'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            typeof url === 'string' &&
            url === '/api/fleet/alerts/test' &&
            (init as RequestInit | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });
  });

  it('switches to subscriptions tab and lists them', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/subscriptions')) {
        return {
          ok: true,
          json: async () => ({
            subscriptions: [
              {
                _id: 's1',
                name: 'Reboots',
                channelId: 'c1',
                eventKinds: ['node.reboot'],
                minSeverity: 'warn',
                enabled: true,
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ channels: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<AlertChannelManager />);
    });

    await waitFor(() => {
      expect(screen.getByText('Subscriptions')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Subscriptions'));
    });

    await waitFor(() => {
      expect(screen.getByText('Reboots')).toBeDefined();
    });
    expect(screen.getByText('node.reboot')).toBeDefined();
  });
});
