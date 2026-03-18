/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type {
  DockerContainerSummary,
  DockerImageSummary,
  DockerVolumeSummary,
  DockerNetworkSummary,
  DockerEventEntry,
  DockerAlertSummary,
  DockerSnapshot,
} from './types';

describe('docker type shapes', () => {
  it('DockerContainerSummary can be constructed', () => {
    const container: DockerContainerSummary = {
      id: 'abc123',
      name: 'web',
      image: 'nginx:latest',
      state: 'running',
      status: 'Up 2 hours',
      createdAt: '2026-03-18T00:00:00Z',
      ports: ['80/tcp', '443/tcp'],
      networks: ['bridge'],
      mounts: [{ source: '/data', destination: '/var/www', mode: 'rw', rw: true }],
      env: ['NGINX_HOST=example.com'],
      restartCount: 0,
      cpuPercent: 0.5,
      memoryPercent: 1.2,
      memoryUsageBytes: 52428800,
      memoryLimitBytes: 4294967296,
      blockReadBytes: 1024,
      blockWriteBytes: 2048,
      networkInBytes: 10240,
      networkOutBytes: 20480,
    };
    expect(container.id).toBe('abc123');
    expect(container.state).toBe('running');
    expect(container.ports).toHaveLength(2);
    expect(container.mounts[0].rw).toBe(true);
  });

  it('DockerContainerSummary optional fields can be omitted', () => {
    const container: DockerContainerSummary = {
      id: 'xyz',
      name: 'minimal',
      image: 'alpine',
      state: 'exited',
      status: 'Exited (0)',
      createdAt: '2026-03-18T00:00:00Z',
      ports: [],
      networks: [],
      mounts: [],
      env: [],
      restartCount: 0,
      cpuPercent: 0,
      memoryPercent: 0,
      memoryUsageBytes: 0,
      memoryLimitBytes: 0,
      blockReadBytes: 0,
      blockWriteBytes: 0,
      networkInBytes: 0,
      networkOutBytes: 0,
    };
    expect(container.imageId).toBeUndefined();
    expect(container.command).toBeUndefined();
  });

  it('DockerImageSummary tracks usage count', () => {
    const image: DockerImageSummary = {
      id: 'sha256:abc',
      repository: 'nginx',
      tag: 'latest',
      sizeBytes: 141639168,
      createdAt: '2026-01-01T00:00:00Z',
      containersUsing: 2,
    };
    expect(image.repository).toBe('nginx');
    expect(image.containersUsing).toBe(2);
  });

  it('DockerVolumeSummary can be constructed', () => {
    const volume: DockerVolumeSummary = {
      name: 'mydata',
      driver: 'local',
      mountpoint: '/var/lib/docker/volumes/mydata/_data',
      scope: 'local',
    };
    expect(volume.name).toBe('mydata');
    expect(volume.driver).toBe('local');
  });

  it('DockerNetworkSummary can be constructed', () => {
    const network: DockerNetworkSummary = {
      id: 'net123',
      name: 'bridge',
      driver: 'bridge',
      scope: 'local',
    };
    expect(network.driver).toBe('bridge');
  });

  it('DockerEventEntry captures action details', () => {
    const event: DockerEventEntry = {
      id: 'evt1',
      time: '2026-03-18T00:00:00Z',
      action: 'start',
      type: 'container',
      actor: 'web',
      attributes: { image: 'nginx:latest' },
    };
    expect(event.action).toBe('start');
    expect(event.attributes['image']).toBe('nginx:latest');
  });

  it('DockerAlertSummary severity is warning or critical', () => {
    const severities: DockerAlertSummary['severity'][] = ['warning', 'critical'];
    expect(severities).toHaveLength(2);
  });

  it('DockerSnapshot wraps daemon info, containers, images, volumes, networks', () => {
    const snapshot: DockerSnapshot = {
      source: 'docker',
      daemonReachable: true,
      daemon: {
        name: 'docker',
        serverVersion: '24.0.5',
        apiVersion: '1.43',
        operatingSystem: 'linux',
        architecture: 'x86_64',
        containersRunning: 3,
        containersStopped: 1,
        containersPaused: 0,
        storageDriver: 'overlay2',
      },
      diskUsage: {
        imagesBytes: 500000000,
        containersBytes: 10000000,
        volumesBytes: 20000000,
        buildCacheBytes: 5000000,
        totalBytes: 535000000,
        usedPercent: 5.2,
      },
      containers: [],
      images: [],
      volumes: [],
      networks: [],
      events: [],
      alerts: [],
      history: [],
      timestamp: '2026-03-18T00:00:00Z',
    };
    expect(snapshot.daemonReachable).toBe(true);
    expect(snapshot.daemon.containersRunning).toBe(3);
    expect(snapshot.diskUsage.usedPercent).toBe(5.2);
  });

  it('DockerSnapshot source can be docker, mock, or crictl', () => {
    const sources: DockerSnapshot['source'][] = ['docker', 'mock', 'crictl'];
    expect(sources).toHaveLength(3);
  });
});
