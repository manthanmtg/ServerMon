import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ManagedAppDTO } from '../../types';
import { AppCard } from './AppCard';

const app: ManagedAppDTO = {
  id: 'app-1',
  name: 'Solar Stats',
  slug: 'solar-stats',
  templateId: 'nextjs',
  sourceType: 'git',
  domain: 'solar.example.com',
  port: 3071,
  git: {
    url: 'https://github.com/example/solar-stats',
    branch: 'main',
    deployedSha: 'abcdef123',
    autoUpdate: {
      enabled: true,
      intervalMinutes: 15,
      lastCheckCompletedAt: '2026-09-08T20:25:00.000Z',
    },
  },
  commands: { install: '', build: '', start: '' },
  envVars: {},
  healthCheckPath: '/',
  tlsEnabled: true,
  status: 'running',
  releases: [],
  operations: [],
};

describe('AppCard', () => {
  it('keeps deployment primary while secondary actions live in a labelled disclosure', () => {
    const onOpenWorkspace = vi.fn();
    const onUpdate = vi.fn();
    render(
      <AppCard
        app={app}
        view="grid"
        snapshotUnavailable={false}
        busy={false}
        deploying={false}
        updating={false}
        now={new Date('2026-09-08T20:30:00.000Z')}
        onOpenWorkspace={onOpenWorkspace}
        onDeploy={vi.fn()}
        onUpdate={onUpdate}
      />
    );
    expect(screen.getByRole('heading', { name: 'Solar Stats' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Solar Stats' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check & deploy' }));
    expect(onUpdate).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Open Solar Stats workspace' }));
    expect(onOpenWorkspace).toHaveBeenCalledWith();
  });
});
