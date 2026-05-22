import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppsPage, { deriveAppsPageSummary } from './AppsPage';

describe('AppsPage', () => {
  const writeText = vi.fn();

  const openNewAppDialog = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'New App' }));
    return screen.getByRole('dialog', { name: 'New App' });
  };

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

  it('derives app summary counts in one pass', () => {
    const summary = deriveAppsPageSummary([
      { status: 'running' },
      { status: 'failed' },
      { status: 'deploying' },
      { status: 'running' },
    ]);

    expect(summary).toEqual({
      total: 4,
      running: 2,
      failed: 1,
    });
  });

  it('treats malformed app payloads as an empty list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apps: { unexpected: true } }),
    } as Response);

    render(<AppsPage />);

    expect(
      await screen.findByText('Create your first app to start managing deployments from ServerMon.')
    ).toBeTruthy();
  });

  it('opens a labelled generic app creation modal from the top-right action', async () => {
    render(<AppsPage />);

    expect(await screen.findByRole('button', { name: 'New App' })).toBeTruthy();
    expect(screen.queryByLabelText('Template')).toBeNull();

    const dialog = await openNewAppDialog();
    expect(within(dialog).getByLabelText('Template')).toHaveValue('nextjs');
    expect(within(dialog).getByLabelText('Local folder')).toBeChecked();
    expect(within(dialog).getByLabelText('Git repository')).toBeTruthy();
    expect(within(dialog).getByLabelText('App name')).toBeTruthy();
    expect(within(dialog).getByLabelText('Source path')).toBeTruthy();
    expect(within(dialog).getByLabelText('Domain')).toBeTruthy();
    expect(within(dialog).getByLabelText('Local port')).toBeTruthy();
    expect(within(dialog).getByLabelText('Install command')).toBeTruthy();
    expect(within(dialog).getByLabelText('Build command')).toBeTruthy();
    expect(within(dialog).getByLabelText('Start command')).toBeTruthy();
    expect(within(dialog).getByLabelText('Health check path')).toBeTruthy();
    expect(within(dialog).getByLabelText('Enable SSL')).toBeTruthy();
    expect(within(dialog).getByText('Environment variables')).toBeTruthy();
    expect(within(dialog).getByPlaceholderText('/srv/apps/inventory-portal')).toBeTruthy();
    expect(within(dialog).getByPlaceholderText('app.example.com')).toBeTruthy();
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
    const dialog = await openNewAppDialog();

    fireEvent.click(within(dialog).getByLabelText('Git repository'));
    fireEvent.change(within(dialog).getByLabelText('App name'), {
      target: { value: 'Git Portal' },
    });
    fireEvent.change(within(dialog).getByLabelText('Git HTTPS URL'), {
      target: { value: 'https://github.com/acme/git-portal.git' },
    });
    fireEvent.change(within(dialog).getByLabelText('Git branch'), {
      target: { value: 'production' },
    });
    fireEvent.change(within(dialog).getByLabelText('Domain'), {
      target: { value: 'git.example.com' },
    });
    fireEvent.click(within(dialog).getByLabelText('Auto update'));
    fireEvent.change(within(dialog).getByLabelText('Auto update interval'), {
      target: { value: '30' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /create app/i }));

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
    const dialog = await openNewAppDialog();

    fireEvent.change(within(dialog).getByLabelText('App name'), {
      target: { value: 'Inventory Portal' },
    });
    fireEvent.change(within(dialog).getByLabelText('Source path'), {
      target: { value: '/srv/apps/inventory-portal' },
    });
    fireEvent.change(within(dialog).getByLabelText('Domain'), {
      target: { value: 'inventory.example.com' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    fireEvent.change(within(dialog).getByLabelText('Environment variable 1 key'), {
      target: { value: 'NEXT_PUBLIC_APP_URL' },
    });
    fireEvent.change(within(dialog).getByLabelText('Environment variable 1 value'), {
      target: { value: 'https://inventory.example.com' },
    });
    fireEvent.click(within(dialog).getByLabelText('Enable SSL'));
    fireEvent.click(within(dialog).getByRole('button', { name: /create app/i }));

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

    expect(screen.queryByText('NEXT_PUBLIC_APP_URL')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Inventory Portal' }));

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
    expect(screen.queryByText('main')).toBeNull();
    expect(screen.queryByText('abcdef1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Git Portal' }));
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText('abcdef1')).toBeTruthy();
    expect(screen.getByRole('button', { name: /update/i })).toBeTruthy();
  });

  it('shows a clear manual update result and latest auto-update state', async () => {
    const appBeforeUpdate = {
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
          nextRunAt: '2026-05-07T01:00:00.000Z',
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
      currentReleaseId: 'release-1',
      operations: [],
      releases: [
        {
          id: 'release-1',
          status: 'active',
          createdAt: '2026-05-07T00:00:00.000Z',
          activatedAt: '2026-05-07T00:01:00.000Z',
          logs: ['deployed'],
        },
      ],
    };
    const appAfterUpdate = {
      ...appBeforeUpdate,
      git: {
        ...appBeforeUpdate.git,
        autoUpdate: {
          enabled: true,
          intervalMinutes: 60,
          nextRunAt: '2026-05-07T01:00:00.000Z',
          lastRunAt: '2026-05-07T00:00:00.000Z',
          lastStatus: 'unchanged',
        },
      },
      operations: [
        {
          id: 'update-1',
          type: 'update',
          status: 'unchanged',
          title: 'Manual update',
          step: 'No upstream changes found',
          startedAt: '2026-05-07T00:00:00.000Z',
          completedAt: '2026-05-07T00:00:01.000Z',
          releaseId: 'release-1',
          logs: ['$ git fetch origin main', 'No upstream changes found.'],
        },
      ],
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [appBeforeUpdate] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          update: {
            status: 'unchanged',
            releaseId: 'release-1',
            logs: ['No upstream changes found.'],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [appAfterUpdate] }),
      } as Response);

    render(<AppsPage />);
    await screen.findByText('Git Portal');

    fireEvent.click(screen.getByRole('button', { name: /update/i }));

    expect(await screen.findByText('Git Portal is already up to date.')).toBeTruthy();
    expect(screen.getByText('No upstream changes found.')).toBeTruthy();
    expect(screen.getByText('Last auto update')).toBeTruthy();
    expect(screen.getByText('Last result')).toBeTruthy();
    expect(screen.getAllByText('Unchanged').length).toBeGreaterThan(0);
    expect(screen.getByText('Next check')).toBeTruthy();
  });

  it('shows app runtime, operation progress, and opens runtime logs', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
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
                autoUpdate: {
                  enabled: true,
                  intervalMinutes: 60,
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
              currentReleaseId: 'release-1',
              runtime: {
                available: true,
                serviceName: 'servermon-app-git-portal.service',
                activeState: 'active',
                subState: 'running',
                mainPid: 4242,
                cpuPercent: 2.5,
                memoryBytes: 134217728,
                memoryPercent: 1.25,
                uptimeSeconds: 120,
                restartCount: 1,
                checkedAt: '2026-05-06T12:02:01.000Z',
              },
              operations: [
                {
                  id: 'op-1',
                  type: 'update',
                  status: 'running',
                  title: 'Manual update',
                  step: 'Running pnpm build',
                  startedAt: '2026-05-06T12:00:00.000Z',
                  logs: ['$ git fetch origin main', '$ pnpm build'],
                },
              ],
              releases: [
                {
                  id: 'release-1',
                  status: 'active',
                  createdAt: '2026-05-06T12:00:00.000Z',
                  activatedAt: '2026-05-06T12:01:00.000Z',
                  logs: ['Health check passed'],
                },
              ],
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          logs: [
            {
              timestamp: '2026-05-06T12:00:00.000Z',
              priority: 'info',
              message: 'server started',
              unit: 'servermon-app-git-portal.service',
            },
          ],
        }),
      } as Response);

    render(<AppsPage />);
    await screen.findByText('Git Portal');

    fireEvent.click(screen.getByRole('button', { name: 'Expand Git Portal' }));

    expect(screen.getByText('Runtime')).toBeTruthy();
    expect(screen.getByText('PID 4242')).toBeTruthy();
    expect(screen.getByText('2.5% CPU')).toBeTruthy();
    expect(screen.getByText('128 MB memory')).toBeTruthy();
    expect(screen.getByText('Manual update')).toBeTruthy();
    expect(screen.getByText('Running pnpm build')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Runtime logs for Git Portal' }));

    const dialog = await screen.findByRole('dialog', { name: 'Runtime logs' });
    expect(within(dialog).getByText('server started')).toBeTruthy();
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/modules/apps/app-1/logs?lines=200',
      expect.objectContaining({ cache: 'no-store' })
    );
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

  it('rolls back to a selected release from deployment history', async () => {
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
              currentReleaseId: 'release-new',
              releases: [
                {
                  id: 'release-old',
                  status: 'superseded',
                  createdAt: '2026-05-07T00:00:00.000Z',
                  activatedAt: '2026-05-07T00:01:00.000Z',
                  logs: ['old ok'],
                },
                {
                  id: 'release-new',
                  status: 'active',
                  createdAt: '2026-05-07T01:00:00.000Z',
                  activatedAt: '2026-05-07T01:01:00.000Z',
                  logs: ['new ok'],
                },
              ],
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rollback: { releaseId: 'release-old', status: 'active', logs: [] } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [] }),
      } as Response);

    render(<AppsPage />);
    await screen.findByText('Inventory Portal');

    fireEvent.click(
      screen.getByRole('button', { name: 'Deployment history for Inventory Portal' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Deployment history' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rollback to release-old' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/modules/apps/app-1/rollback',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ releaseId: 'release-old' }),
      })
    );
  });

  it('edits an existing app and saves updated commands', async () => {
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
              envVars: {
                NEXT_PUBLIC_APP_URL: 'https://inventory.example.com',
              },
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
        json: async () => ({ app: { id: 'app-1', name: 'Inventory Portal' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [] }),
      } as Response);

    render(<AppsPage />);
    await screen.findByText('Inventory Portal');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Inventory Portal' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit App' });
    expect(within(dialog).getByLabelText('Install command')).toHaveValue(
      'pnpm install --frozen-lockfile'
    );

    fireEvent.change(within(dialog).getByLabelText('Install command'), {
      target: { value: 'pnpm install --prod=false' },
    });
    fireEvent.change(within(dialog).getByLabelText('Build command'), {
      target: { value: 'pnpm build:prod' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/modules/apps/app-1',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"install":"pnpm install --prod=false"'),
      })
    );
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body);
    expect(body.commands).toEqual({
      install: 'pnpm install --prod=false',
      build: 'pnpm build:prod',
      start: 'pnpm start',
    });
    expect(body.envVars).toEqual({
      NEXT_PUBLIC_APP_URL: 'https://inventory.example.com',
    });
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
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/modules/apps/app-1',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});
