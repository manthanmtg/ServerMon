import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DockerStats } from './DockerStats';
import type { DockerSnapshot } from '../../types';

const snapshot: DockerSnapshot = {
  source: 'docker',
  daemonReachable: true,
  daemon: {
    name: 'local-engine',
    serverVersion: '26.0.0',
    apiVersion: '1.45',
    operatingSystem: 'Linux',
    architecture: 'x86_64',
    containersRunning: 3,
    containersStopped: 2,
    containersPaused: 1,
    storageDriver: 'overlay2',
  },
  diskUsage: {
    imagesBytes: 0,
    containersBytes: 0,
    volumesBytes: 0,
    buildCacheBytes: 0,
    totalBytes: 0,
    usedPercent: 0,
  },
  containers: [],
  images: [],
  volumes: [],
  networks: [],
  events: [],
  alerts: [],
  history: [],
  timestamp: '2026-04-30T09:30:00.000Z',
};

describe('DockerStats', () => {
  it('uses semantic tone surfaces for each container state', () => {
    render(<DockerStats snapshot={snapshot} />);

    expect(screen.getByText('Running').closest('[data-testid="docker-stat-card"]')).toHaveClass(
      'bg-success/5',
      'border-success/20'
    );
    expect(screen.getByText('Stopped').closest('[data-testid="docker-stat-card"]')).toHaveClass(
      'bg-destructive/5',
      'border-destructive/20'
    );
    expect(screen.getByText('Paused').closest('[data-testid="docker-stat-card"]')).toHaveClass(
      'bg-warning/5',
      'border-warning/20'
    );
  });
});
