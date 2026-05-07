import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppsPage from './AppsPage';

describe('AppsPage', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apps: [] }),
    } as Response);
  });

  it('renders a labelled generic app creation form with a template selector', async () => {
    render(<AppsPage />);

    expect(await screen.findByText('New App')).toBeTruthy();
    expect(screen.getByLabelText('Template')).toHaveValue('nextjs');
    expect(screen.getByLabelText('App name')).toBeTruthy();
    expect(screen.getByLabelText('Source path')).toBeTruthy();
    expect(screen.getByLabelText('Domain')).toBeTruthy();
    expect(screen.getByLabelText('Local port')).toBeTruthy();
    expect(screen.getByLabelText('Install command')).toBeTruthy();
    expect(screen.getByLabelText('Build command')).toBeTruthy();
    expect(screen.getByLabelText('Start command')).toBeTruthy();
    expect(screen.getByLabelText('Health check path')).toBeTruthy();
    expect(screen.getByLabelText('Enable SSL')).toBeTruthy();
    expect(screen.getByText('Environment variables')).toBeTruthy();
    expect(screen.getByPlaceholderText('/srv/apps/inventory-portal')).toBeTruthy();
    expect(screen.getByPlaceholderText('app.example.com')).toBeTruthy();
  });

  it('submits the selected template with the app definition', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          app: {
            id: 'app-1',
            name: 'Inventory Portal',
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [] }),
      } as Response);

    render(<AppsPage />);
    await screen.findByText('New App');

    fireEvent.change(screen.getByLabelText('App name'), {
      target: { value: 'Inventory Portal' },
    });
    fireEvent.change(screen.getByLabelText('Source path'), {
      target: { value: '/srv/apps/inventory-portal' },
    });
    fireEvent.change(screen.getByLabelText('Domain'), {
      target: { value: 'inventory.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getByLabelText('Environment variable 1 key'), {
      target: { value: 'NEXT_PUBLIC_APP_URL' },
    });
    fireEvent.change(screen.getByLabelText('Environment variable 1 value'), {
      target: { value: 'https://inventory.example.com' },
    });
    fireEvent.click(screen.getByLabelText('Enable SSL'));
    fireEvent.click(screen.getByRole('button', { name: /create app/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/modules/apps',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          templateId: 'nextjs',
          name: 'Inventory Portal',
          sourcePath: '/srv/apps/inventory-portal',
          domain: 'inventory.example.com',
          port: 3010,
          commands: {
            install: 'pnpm install --frozen-lockfile',
            build: 'pnpm build',
            start: 'pnpm start',
          },
          healthCheckPath: '/',
          tlsEnabled: true,
          envVars: {
            NEXT_PUBLIC_APP_URL: 'https://inventory.example.com',
          },
        }),
      })
    );
  });

  it('shows registered app env vars hidden by default and copies key and revealed value', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apps: [
          {
            id: 'app-1',
            name: 'Inventory Portal',
            slug: 'inventory-portal',
            templateId: 'nextjs',
            sourcePath: '/srv/apps/inventory-portal',
            domain: 'inventory.example.com',
            port: 3010,
            commands: {
              install: 'pnpm install --frozen-lockfile',
              build: 'pnpm build',
              start: 'pnpm start',
            },
            envVars: {
              NEXT_PUBLIC_APP_URL: 'https://inventory.example.com',
              OPENAI_API_KEY: 'sk-secret',
            },
            healthCheckPath: '/',
            tlsEnabled: true,
            status: 'running',
            releases: [],
          },
        ],
      }),
    } as Response);

    render(<AppsPage />);
    await screen.findByText('Inventory Portal');

    expect(screen.getByText('NEXT_PUBLIC_APP_URL')).toBeTruthy();
    expect(screen.getByText('OPENAI_API_KEY')).toBeTruthy();
    expect(screen.queryByText('sk-secret')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByText('OPENAI_API_KEY'));
    });
    expect(writeText).toHaveBeenCalledWith('OPENAI_API_KEY');

    fireEvent.click(screen.getByRole('button', { name: 'Show OPENAI_API_KEY' }));
    expect(screen.getByText('sk-secret')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText('sk-secret'));
    });
    expect(writeText).toHaveBeenCalledWith('sk-secret');

    fireEvent.click(screen.getByRole('button', { name: 'Hide OPENAI_API_KEY' }));
    expect(screen.queryByText('sk-secret')).toBeNull();
  });
});
