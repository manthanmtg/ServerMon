import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceLogPanel } from './ServiceLogPanel';

describe('ServiceLogPanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        logs: [
          {
            timestamp: '2026-04-27T11:00:00.000Z',
            priority: 'info',
            message: 'Started nginx',
            unit: 'nginx.service',
          },
        ],
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and renders recent service logs', async () => {
    render(<ServiceLogPanel serviceName="nginx.service" />);

    await waitFor(() => expect(screen.getByText('Started nginx')).toBeDefined());

    expect(global.fetch).toHaveBeenCalledWith('/api/modules/services/nginx.service/logs?lines=30', {
      cache: 'no-store',
    });
  });
});
