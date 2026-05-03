import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NginxHostWizard } from './NginxHostWizard';

describe('NginxHostWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          ok: true,
          path: '/etc/nginx/servermon/life.conf',
          output: 'syntax is ok',
        },
      }),
    });
  });

  it('previews and submits a direct guided host', async () => {
    const onCreated = vi.fn();
    render(<NginxHostWizard onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'life.manthanby.cv' } });
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'life.conf' } });
    fireEvent.change(screen.getByLabelText('Upstream port'), { target: { value: '8912' } });

    expect(screen.getByText('server_name life.manthanby.cv;', { exact: false })).toBeDefined();
    expect(screen.getByText(/^A\s+life/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Create host' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/nginx/vhosts',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"domainPattern":"life.manthanby.cv"'),
      })
    );
  });

  it('shows wildcard DNS guidance', () => {
    render(<NginxHostWizard />);

    fireEvent.change(screen.getByLabelText('Domain'), {
      target: { value: '*.ultron.manthanby.cv' },
    });

    expect(screen.getByText(/^A\s+\*\.ultron/)).toBeDefined();
    expect(screen.getByText(/Wildcard DNS does not cover ultron.manthanby.cv/)).toBeDefined();
  });

  it('submits raw managed config mode', async () => {
    render(<NginxHostWizard />);

    fireEvent.click(screen.getByRole('button', { name: 'Raw config' }));
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'wildcard.conf' } });
    fireEvent.change(screen.getByLabelText('Raw config'), {
      target: { value: 'server { listen 80; server_name *.ultron.manthanby.cv; }' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create host' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/modules/nginx/vhosts',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"mode":"raw"'),
        })
      )
    );
  });
});
