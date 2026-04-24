import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { FleetAlertsPanel } from './FleetAlertsPanel';

describe('FleetAlertsPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders healthy state when no issues', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/fleet/nodes')) {
          return {
            ok: true,
            json: async () => ({
              nodes: [{ _id: 'n1', name: 'A', slug: 'a', status: 'online' }],
            }),
          };
        }
        if (url.startsWith('/api/fleet/routes')) {
          return {
            ok: true,
            json: async () => ({
              routes: [
                {
                  _id: 'r1',
                  name: 'R',
                  slug: 'r',
                  domain: 'app.example.com',
                  dnsStatus: 'ok',
                  tlsStatus: 'active',
                },
              ],
            }),
          };
        }
        if (url.startsWith('/api/fleet/logs')) {
          return { ok: true, json: async () => ({ events: [] }) };
        }
        return { ok: true, json: async () => ({}) };
      })
    );

    await act(async () => {
      render(<FleetAlertsPanel />);
    });

    await waitFor(() => {
      expect(screen.getByText(/All fleet systems healthy/)).toBeDefined();
    });
  });

  it('derives alerts from degraded nodes, bad routes, error logs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/fleet/nodes')) {
          return {
            ok: true,
            json: async () => ({
              nodes: [
                {
                  _id: 'n1',
                  name: 'A',
                  slug: 'a',
                  status: 'offline',
                  computedStatus: 'offline',
                },
              ],
            }),
          };
        }
        if (url.startsWith('/api/fleet/routes')) {
          return {
            ok: true,
            json: async () => ({
              routes: [
                {
                  _id: 'r1',
                  name: 'R',
                  slug: 'r',
                  domain: 'app.example.com',
                  dnsStatus: 'missing',
                  tlsStatus: 'active',
                },
              ],
            }),
          };
        }
        if (url.startsWith('/api/fleet/logs')) {
          return {
            ok: true,
            json: async () => ({
              events: [
                {
                  _id: 'e1',
                  createdAt: new Date().toISOString(),
                  message: 'boom',
                  eventType: 'fail',
                },
              ],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      })
    );

    await act(async () => {
      render(<FleetAlertsPanel />);
    });

    await waitFor(() => {
      expect(screen.getByText(/1 node\(s\) unhealthy/)).toBeDefined();
    });
    expect(screen.getByText(/1 route\(s\) with bad DNS\/TLS/)).toBeDefined();
    expect(screen.getByText(/1 recent error event\(s\)/)).toBeDefined();
  });
});
