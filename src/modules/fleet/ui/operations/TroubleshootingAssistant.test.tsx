import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { TroubleshootingAssistant } from './TroubleshootingAssistant';

describe('TroubleshootingAssistant', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders input and diagnose button', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await act(async () => {
      render(<TroubleshootingAssistant />);
    });

    expect(screen.getByLabelText('Node slug')).toBeDefined();
    expect(screen.getByText('Diagnose')).toBeDefined();
  });

  it('clicking Diagnose resolves slug then posts diagnose', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/fleet/nodes?search=')) {
        return {
          ok: true,
          json: async () => ({
            nodes: [{ _id: 'n1', slug: 'edge-01' }],
            total: 1,
          }),
        };
      }
      if (url.endsWith('/diagnose') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            kind: 'client',
            targetId: 'n1',
            steps: [
              {
                step: 'checkHubReachability',
                status: 'fail',
                evidence: 'pending-phase-2',
              },
            ],
            summary: 'fail',
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<TroubleshootingAssistant />);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Node slug'), {
        target: { value: 'edge-01' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Diagnose'));
    });

    await waitFor(() => {
      expect(screen.getByText('checkHubReachability')).toBeDefined();
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === 'string' &&
          url.endsWith('/api/fleet/nodes/n1/diagnose') &&
          (init as { method?: string } | undefined)?.method === 'POST'
      )
    ).toBe(true);
  });
});
