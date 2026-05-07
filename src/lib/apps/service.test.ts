/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  CreateManagedAppSchema,
  getAppTemplate,
  mapManagedAppToDTO,
  normalizeCreateManagedAppInput,
} from './service';

describe('apps service helpers', () => {
  it('normalizes create input into a nextjs managed app config', () => {
    const parsed = CreateManagedAppSchema.parse({
      name: 'LifeOS',
      sourcePath: '/srv/apps/inventory-portal',
      domain: 'app.example.com',
      port: 3010,
      commands: {
        install: 'pnpm install --frozen-lockfile',
        build: 'pnpm build',
        start: 'pnpm start',
      },
      envVars: {
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        OPENAI_API_KEY: 'sk-test',
      },
      tlsEnabled: true,
    });

    expect(normalizeCreateManagedAppInput(parsed)).toEqual({
      name: 'LifeOS',
      slug: 'lifeos',
      templateId: 'nextjs',
      sourceType: 'local',
      sourcePath: '/srv/apps/inventory-portal',
      domain: 'app.example.com',
      port: 3010,
      commands: {
        install: 'pnpm install --frozen-lockfile',
        build: 'pnpm build',
        start: 'pnpm start',
      },
      envVars: {
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        OPENAI_API_KEY: 'sk-test',
      },
      healthCheckPath: '/',
      tlsEnabled: true,
      status: 'draft',
      releases: [],
      autoUpdate: {
        enabled: false,
        intervalMinutes: 60,
      },
    });
  });

  it('normalizes HTTPS git create input with optional auto update settings', () => {
    const parsed = CreateManagedAppSchema.parse({
      name: 'Git App',
      sourceType: 'git',
      gitUrl: 'https://github.com/acme/git-app.git',
      gitBranch: 'production',
      domain: 'git.example.com',
      port: 3011,
      commands: {
        install: 'pnpm install --frozen-lockfile',
        build: 'pnpm build',
        start: 'pnpm start',
      },
      autoUpdate: {
        enabled: true,
        intervalMinutes: 30,
      },
    });

    expect(normalizeCreateManagedAppInput(parsed)).toMatchObject({
      name: 'Git App',
      slug: 'git-app',
      sourceType: 'git',
      sourcePath: undefined,
      gitUrl: 'https://github.com/acme/git-app.git',
      gitBranch: 'production',
      autoUpdate: {
        enabled: true,
        intervalMinutes: 30,
      },
    });
  });

  it('rejects git source input without an HTTPS URL', () => {
    expect(() =>
      CreateManagedAppSchema.parse({
        name: 'Git App',
        sourceType: 'git',
        gitUrl: 'git@github.com:acme/git-app.git',
        domain: 'git.example.com',
        port: 3011,
        commands: {
          install: 'pnpm install',
          build: 'pnpm build',
          start: 'pnpm start',
        },
      })
    ).toThrow();
  });

  it('rejects empty commands and invalid domains', () => {
    expect(() =>
      CreateManagedAppSchema.parse({
        name: 'LifeOS',
        sourcePath: '/srv/lifeos',
        domain: 'not a domain',
        port: 3010,
        commands: { install: '', build: 'pnpm build', start: 'pnpm start' },
      })
    ).toThrow();
  });

  it('exposes an extensible nextjs template descriptor with detection TODOs', () => {
    expect(getAppTemplate('nextjs')).toMatchObject({
      id: 'nextjs',
      name: 'Next.js App',
      defaultHealthCheckPath: '/',
      requiredCommands: ['install', 'build', 'start'],
    });
    expect(getAppTemplate('nextjs')?.todos).toContain('Auto-detect package manager and commands');
  });

  it('maps persisted app records to DTOs with raw env vars for authenticated UI reveal', () => {
    const dto = mapManagedAppToDTO(
      {
        _id: { toString: () => 'app-id' },
        name: 'LifeOS',
        slug: 'lifeos',
        templateId: 'nextjs',
        sourceType: 'git',
        sourcePath: '/srv/lifeos',
        gitUrl: 'https://github.com/acme/lifeos.git',
        gitBranch: 'main',
        gitCurrentSha: 'abcdef123456',
        gitLastCheckedAt: new Date('2026-05-06T12:30:00.000Z'),
        gitLastUpdatedAt: new Date('2026-05-06T12:31:00.000Z'),
        domain: 'app.example.com',
        port: 3010,
        commands: { install: 'pnpm install', build: 'pnpm build', start: 'pnpm start' },
        envVars: new Map([
          ['NEXT_PUBLIC_APP_URL', 'https://app.example.com'],
          ['OPENAI_API_KEY', 'sk-secret'],
        ]),
        healthCheckPath: '/',
        tlsEnabled: true,
        status: 'running',
        currentReleaseId: '20260506-123456-789',
        releases: [
          {
            id: '20260506-123456-789',
            status: 'active',
            createdAt: new Date('2026-05-06T12:34:56.789Z'),
            logs: ['deployed'],
          },
        ],
        autoUpdate: {
          enabled: true,
          intervalMinutes: 60,
          nextRunAt: new Date('2026-05-06T13:30:00.000Z'),
          lastRunAt: new Date('2026-05-06T12:30:00.000Z'),
          lastStatus: 'updated',
        },
        createdAt: new Date('2026-05-06T12:00:00.000Z'),
        updatedAt: new Date('2026-05-06T12:35:00.000Z'),
        lastDeployedAt: new Date('2026-05-06T12:35:00.000Z'),
      },
      '203.0.113.10'
    );

    expect(dto.envVars).toEqual({
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      OPENAI_API_KEY: 'sk-secret',
    });
    expect(dto.sourceType).toBe('git');
    expect(dto.git).toEqual({
      url: 'https://github.com/acme/lifeos.git',
      branch: 'main',
      currentSha: 'abcdef123456',
      lastCheckedAt: '2026-05-06T12:30:00.000Z',
      lastUpdatedAt: '2026-05-06T12:31:00.000Z',
      autoUpdate: {
        enabled: true,
        intervalMinutes: 60,
        nextRunAt: '2026-05-06T13:30:00.000Z',
        lastRunAt: '2026-05-06T12:30:00.000Z',
        lastStatus: 'updated',
      },
    });
    expect(dto.tlsEnabled).toBe(true);
    expect(dto.dns?.summary).toBe('Create A record: app.example.com -> 203.0.113.10');
    expect(dto.releases[0]?.createdAt).toBe('2026-05-06T12:34:56.789Z');
  });
});
