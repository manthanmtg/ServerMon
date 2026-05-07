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
    });

    expect(normalizeCreateManagedAppInput(parsed)).toEqual({
      name: 'LifeOS',
      slug: 'lifeos',
      templateId: 'nextjs',
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
      status: 'draft',
      releases: [],
    });
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

  it('maps persisted app records to API-safe DTOs with masked env vars and DNS instructions', () => {
    const dto = mapManagedAppToDTO(
      {
        _id: { toString: () => 'app-id' },
        name: 'LifeOS',
        slug: 'lifeos',
        templateId: 'nextjs',
        sourcePath: '/srv/lifeos',
        domain: 'app.example.com',
        port: 3010,
        commands: { install: 'pnpm install', build: 'pnpm build', start: 'pnpm start' },
        envVars: new Map([
          ['NEXT_PUBLIC_APP_URL', 'https://app.example.com'],
          ['OPENAI_API_KEY', 'sk-secret'],
        ]),
        healthCheckPath: '/',
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
        createdAt: new Date('2026-05-06T12:00:00.000Z'),
        updatedAt: new Date('2026-05-06T12:35:00.000Z'),
        lastDeployedAt: new Date('2026-05-06T12:35:00.000Z'),
      },
      '203.0.113.10'
    );

    expect(dto.envVars).toEqual({
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      OPENAI_API_KEY: '***',
    });
    expect(dto.dns?.summary).toBe('Create A record: app.example.com -> 203.0.113.10');
    expect(dto.releases[0]?.createdAt).toBe('2026-05-06T12:34:56.789Z');
  });
});
