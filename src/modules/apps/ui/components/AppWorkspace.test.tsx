import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ManagedAppDTO } from '../../types';
import { AppWorkspace } from './AppWorkspace';

const app: ManagedAppDTO = {
  id: 'app-1',
  name: 'SolarStats',
  slug: 'solarstats',
  templateId: 'nextjs',
  sourceType: 'local',
  sourcePath: '/srv/solar',
  domain: 'solar.example.com',
  port: 3071,
  commands: { install: 'pnpm install', build: 'pnpm build', start: 'pnpm start' },
  envVars: { API_KEY: 'hidden' },
  healthCheckPath: '/',
  tlsEnabled: true,
  status: 'running',
  releases: [],
  operations: [],
};

describe('AppWorkspace', () => {
  it('opens focused tabs and keeps environment values masked by default', () => {
    const onClose = vi.fn();
    render(
      <AppWorkspace
        app={app}
        initialTab="overview"
        snapshotUnavailable={false}
        onClose={onClose}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenRuntimeLogs={vi.fn()}
        onOpenHistory={vi.fn()}
      />
    );
    expect(screen.getByRole('dialog', { name: 'SolarStats' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByText('••••••••••••')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Deployments' }));
    expect(screen.getByText('No deployment history yet.')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Deployments' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      expect.stringContaining('logs-panel')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close SolarStats' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
