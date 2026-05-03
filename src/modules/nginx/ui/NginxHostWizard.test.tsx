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
          path: '/etc/nginx/servermon/app.conf',
          output: 'syntax is ok',
        },
      }),
    });
  });

  it('previews and submits a direct guided host', async () => {
    const onCreated = vi.fn();
    render(<NginxHostWizard onCreated={onCreated} />);

    expect(screen.queryByLabelText('Domain')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add host' }));

    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'app.example.com' } });
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'app.conf' } });
    fireEvent.change(screen.getByLabelText('Upstream port'), { target: { value: '8912' } });

    expect(screen.getByText('server_name app.example.com;', { exact: false })).toBeDefined();
    expect(screen.getByText(/^A\s+app/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Create host' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/nginx/vhosts',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"domainPattern":"app.example.com"'),
      })
    );
  });

  it('shows wildcard DNS guidance', () => {
    render(<NginxHostWizard />);

    fireEvent.click(screen.getByRole('button', { name: 'Add host' }));
    fireEvent.change(screen.getByLabelText('Domain'), {
      target: { value: '*.apps.example.com' },
    });

    expect(screen.getByText(/^A\s+\*\.apps/)).toBeDefined();
    expect(screen.getByText(/Wildcard DNS does not cover apps.example.com/)).toBeDefined();
  });

  it('submits raw managed config mode', async () => {
    render(<NginxHostWizard />);

    fireEvent.click(screen.getByRole('button', { name: 'Add host' }));
    fireEvent.click(screen.getByRole('button', { name: 'Raw config' }));
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'wildcard.conf' } });
    fireEvent.change(screen.getByLabelText('Raw config'), {
      target: { value: 'server { listen 80; server_name *.apps.example.com; }' },
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
