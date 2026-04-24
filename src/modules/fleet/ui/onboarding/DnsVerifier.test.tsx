import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { DnsVerifier } from './DnsVerifier';

describe('DnsVerifier', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the Check button initially', () => {
    render(<DnsVerifier />);
    expect(screen.getByText(/Check DNS/i)).toBeDefined();
  });

  it('fetches /api/fleet/server/preflight and renders filtered DNS/TLS results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: 'dns-a-record', label: 'A record', status: 'ok', detail: 'hub.test' },
          { id: 'tls-cert', label: 'TLS certificate', status: 'skip' },
          { id: 'port-7000', label: 'Port 7000', status: 'ok' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DnsVerifier />);
    const btn = screen.getByText(/Check DNS/i);
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/fleet/server/preflight', {
        method: 'POST',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('A record')).toBeDefined();
      expect(screen.getByText('TLS certificate')).toBeDefined();
    });
    // Non dns/tls rows filtered
    expect(screen.queryByText('Port 7000')).toBeNull();
  });

  it('renders empty-state message when no dns/tls results match', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ id: 'port-7000', label: 'Port 7000', status: 'ok' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DnsVerifier />);
    await act(async () => {
      fireEvent.click(screen.getByText(/Check DNS/i));
    });
    await waitFor(() => {
      expect(screen.getByText(/No DNS\/TLS checks configured/i)).toBeDefined();
    });
  });

  it('renders error when fetch fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DnsVerifier />);
    await act(async () => {
      fireEvent.click(screen.getByText(/Check DNS/i));
    });
    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeDefined();
    });
  });
});
