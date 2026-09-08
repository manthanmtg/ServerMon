import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppsPage, {
  countLogicalActiveOperations,
  deriveAppsPageSummary,
  deriveAppsPageViewModels,
} from './AppsPage';

const localApp = {
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
  envVars: { OPENAI_API_KEY: 'sk-secret' },
  healthCheckPath: '/',
  tlsEnabled: true,
  status: 'running' as const,
  releases: [],
  operations: [],
};

describe('AppsPage', () => {
  it('derives app summary counts and logical active operations without mutation', () => {
    expect(deriveAppsPageSummary([localApp])).toMatchObject({ total: 1, running: 1 });
    expect(
      countLogicalActiveOperations([
        {
          ...localApp,
          operations: [{ id: 'deploy-1', type: 'deploy', status: 'running' as const }],
        },
      ])
    ).toBe(1);
    expect(deriveAppsPageViewModels([localApp], new Set(), null, new Set())).toHaveLength(1);
  });

  it('filters the compact collection and opens app settings in the workspace', async () => {
    global.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ apps: [localApp] }),
        }) as Response
    );

    render(<AppsPage />);
    await screen.findByText('Inventory Portal');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search apps' }), {
      target: { value: 'inventory.example' },
    });
    expect(screen.getByText('1 of 1 apps')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Inventory Portal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));

    expect(screen.getByText('OPENAI_API_KEY')).toBeTruthy();
    expect(screen.queryByText('sk-secret')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show OPENAI_API_KEY' }));
    expect(screen.getByText('sk-secret')).toBeTruthy();
  });

  it('queues a deployment from the card and keeps the action locked', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [localApp] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          deployment: { operationId: 'op_queue-1', status: 'queued', phase: 'queued' },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [localApp] }),
      } as Response);

    render(<AppsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deploy' }));

    expect(await screen.findByText('Inventory Portal deployment queued.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close Deployment logs' }));
    expect(screen.getByText('Operation queued')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Deploying…' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});
