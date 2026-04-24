import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { AccessPolicyEditor } from './AccessPolicyEditor';

describe('AccessPolicyEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders existing policies', async () => {
    const policies = [
      {
        _id: 'p1',
        name: 'Admins only',
        mode: 'ip_allowlist',
        ipAllowlist: ['10.0.0.0/8'],
        allowedUserRoles: ['admin'],
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ policies }),
      })
    );

    await act(async () => {
      render(<AccessPolicyEditor />);
    });

    await waitFor(() => {
      expect(screen.getByText('Admins only')).toBeDefined();
    });
    expect(screen.getByText('ip_allowlist')).toBeDefined();
  });

  it('New policy form submits to POST', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ policy: { _id: 'new', name: 'X' } }),
        };
      }
      return { ok: true, json: async () => ({ policies: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<AccessPolicyEditor />);
    });

    await waitFor(() => {
      expect(screen.getByText('New policy')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('New policy'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'Ops' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create policy'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === '/api/fleet/access-policies' &&
            (init as { method?: string } | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });
  });
});
