import { describe, expect, it } from 'vitest';
import type { ManagedAppDTO } from '../types';
import {
  filterApps,
  formatAppRelativeTime,
  getAppMonogram,
  getAppPublicUrl,
  sortAppsByName,
} from './appPresentation';

const apps = [
  {
    id: 'life',
    name: 'LifeOS',
    slug: 'life-os',
    templateId: 'nextjs',
    domain: 'life.example.com',
    sourceType: 'git',
    git: {
      url: 'https://github.com/example/life-os',
      branch: 'main',
      autoUpdate: { enabled: true, intervalMinutes: 15 },
    },
    status: 'running',
    port: 3071,
    commands: { install: '', build: '', start: '' },
    envVars: {},
    healthCheckPath: '/',
    tlsEnabled: true,
    releases: [],
    operations: [],
  },
  {
    id: 'solar',
    name: 'Solar Stats',
    slug: 'solar-stats',
    templateId: 'nextjs',
    domain: 'solar.example.com',
    sourceType: 'local',
    sourcePath: '/srv/solar-stats',
    status: 'failed',
    port: 3072,
    commands: { install: '', build: '', start: '' },
    envVars: {},
    healthCheckPath: '/',
    tlsEnabled: false,
    releases: [],
    operations: [],
  },
] satisfies ManagedAppDTO[];

describe('app presentation', () => {
  it('searches configured identity and source fields without searching environment values', () => {
    expect(
      filterApps(apps, { query: 'github', filter: 'all', snapshotUnavailable: false })
    ).toEqual([apps[0]]);
    expect(
      filterApps(apps, { query: 'solar-stats', filter: 'all', snapshotUnavailable: false })
    ).toEqual([apps[1]]);
    expect(
      filterApps(apps, { query: 'secret', filter: 'all', snapshotUnavailable: false })
    ).toEqual([]);
  });

  it('keeps filtered order stable by name and id', () => {
    expect(sortAppsByName([...apps].reverse()).map((app) => app.id)).toEqual(['life', 'solar']);
  });

  it('derives a scheme-aware public URL and deterministic monogram', () => {
    expect(getAppPublicUrl(apps[0])).toBe('https://life.example.com');
    expect(getAppPublicUrl(apps[1])).toBe('http://solar.example.com');
    expect(getAppMonogram(apps[1])).toBe('SS');
  });

  it('formats valid past, future, and missing times without inventing a timestamp', () => {
    const now = new Date('2026-09-08T20:30:00.000Z');
    expect(formatAppRelativeTime('2026-09-08T20:25:00.000Z', now)).toBe('5 min ago');
    expect(formatAppRelativeTime('2026-09-08T20:45:00.000Z', now)).toBe('in 15 min');
    expect(formatAppRelativeTime(undefined, now, 'Not deployed')).toBe('Not deployed');
  });
});
