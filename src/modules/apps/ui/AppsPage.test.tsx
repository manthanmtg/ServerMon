import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.getByLabelText('Local folder')).toBeChecked();
    expect(screen.getByLabelText('Git repository')).toBeTruthy();
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

  it('submits git source settings with auto update enabled', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ app: { id: 'app-1', name: 'Git Portal' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [] }),
      } as Response);

    render(<AppsPage />);
    await screen.findByText('New App');

    fireEvent.click(screen.getByLabelText('Git repository'));
    fireEvent.change(screen.getByLabelText('App name'), {
      target: { value: 'Git Portal' },
    });
    fireEvent.change(screen.getByLabelText('Git HTTPS URL'), {
      target: { value: 'https://github.com/acme/git-portal.git' },
    });
    fireEvent.change(screen.getByLabelText('Git branch'), {
      target: { value: 'production' },
    });
    fireEvent.change(screen.getByLabelText('Domain'), {
      target: { value: 'git.example.com' },
    });
    fireEvent.click(screen.getByLabelText('Auto update'));
    fireEvent.change(screen.getByLabelText('Auto update interval'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create app/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/modules/apps',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"sourceType":"git"'),
      })
    );
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body);
    expect(body).toMatchObject({
      sourceType: 'git',
      gitUrl: 'https://github.com/acme/git-portal.git',
      gitBranch: 'production',
      autoUpdate: {
        enabled: true,
        intervalMinutes: 30,
      },
    });
    expect(body.sourcePath).toBeUndefined();
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
          sourceType: 'local',
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
            sourceType: 'local',
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

  it('shows update controls for git-backed apps', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apps: [
          {
            id: 'app-1',
            name: 'Git Portal',
            slug: 'git-portal',
            templateId: 'nextjs',
            sourceType: 'git',
            git: {
              url: 'https://github.com/acme/git-portal.git',
              branch: 'main',
              currentSha: 'abcdef123456',
              lastCheckedAt: '2026-05-07T00:00:00.000Z',
              autoUpdate: {
                enabled: true,
                intervalMinutes: 60,
                lastStatus: 'updated',
              },
            },
            domain: 'git.example.com',
            port: 3010,
            commands: {
              install: 'pnpm install --frozen-lockfile',
              build: 'pnpm build',
              start: 'pnpm start',
            },
            envVars: {},
            healthCheckPath: '/',
            tlsEnabled: false,
            status: 'running',
            releases: [],
          },
        ],
      }),
    } as Response);

    render(<AppsPage />);
    await screen.findByText('Git Portal');

    expect(screen.getByText('Git')).toBeTruthy();
    expect(screen.getAllByText('https://github.com/acme/git-portal.git').length).toBeGreaterThan(0);
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText('abcdef1')).toBeTruthy();
    expect(screen.getByRole('button', { name: /update/i })).toBeTruthy();
  });

  it('opens a clean deployment history modal with passed and failed releases', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apps: [
          {
            id: 'app-1',
            name: 'Inventory Portal',
            slug: 'inventory-portal',
            templateId: 'nextjs',
            sourceType: 'local',
            sourcePath: '/srv/apps/inventory-portal',
            domain: 'inventory.example.com',
            port: 3010,
            commands: {
              install: 'pnpm install --frozen-lockfile',
              build: 'pnpm build',
              start: 'pnpm start',
            },
            envVars: {},
            healthCheckPath: '/',
            tlsEnabled: false,
            status: 'running',
            currentReleaseId: 'release-ok',
            releases: [
              {
                id: 'release-ok',
                status: 'active',
                createdAt: '2026-05-07T00:00:00.000Z',
                activatedAt: '2026-05-07T00:01:00.000Z',
                logs: ['Health check passed'],
              },
              {
                id: 'release-failed',
                status: 'failed',
                createdAt: '2026-05-07T01:00:00.000Z',
                error: 'Command failed: pnpm build',
                logs: ['build failed'],
              },
            ],
          },
        ],
      }),
    } as Response);

    render(<AppsPage />);
    await screen.findByText('Inventory Portal');

    fireEvent.click(
      screen.getByRole('button', { name: 'Deployment history for Inventory Portal' })
    );

    const dialog = screen.getByRole('dialog', { name: 'Deployment history' });
    expect(within(dialog).getByText('release-ok')).toBeTruthy();
    expect(within(dialog).getByText('Passed')).toBeTruthy();
    expect(within(dialog).getByText('release-failed')).toBeTruthy();
    expect(within(dialog).getByText('Failed')).toBeTruthy();
    expect(within(dialog).getByText('Command failed: pnpm build')).toBeTruthy();
    expect(within(dialog).getByText('build failed')).toBeTruthy();
  });

  it('requires confirmation before deleting an app', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: [
            {
              id: 'app-1',
              name: 'Inventory Portal',
              slug: 'inventory-portal',
              templateId: 'nextjs',
              sourceType: 'local',
              sourcePath: '/srv/apps/inventory-portal',
              domain: 'inventory.example.com',
              port: 3010,
              commands: {
                install: 'pnpm install --frozen-lockfile',
                build: 'pnpm build',
                start: 'pnpm start',
              },
              envVars: {},
              healthCheckPath: '/',
              tlsEnabled: false,
              status: 'running',
              releases: [],
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deletion: { id: 'app-1', logs: ['deleted'] } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [] }),
      } as Response);

    render(<AppsPage />);
    await screen.findByText('Inventory Portal');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Inventory Portal' }));
    expect(screen.getByText('Delete Inventory Portal?')).toBeTruthy();
    expect(screen.getByText(/cannot be undone/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/modules/apps/app-1', {
      method: 'DELETE',
    });
  });
});
