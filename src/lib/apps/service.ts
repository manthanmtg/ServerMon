import { z } from 'zod';
import { isIP } from 'node:net';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import connectDB from '@/lib/db';
import ManagedApp, { type IManagedApp } from '@/models/ManagedApp';
import type {
  AppAutoUpdate,
  AppTemplate,
  CreateManagedAppInput,
  ManagedAppDTO,
  ManagedAppStatus,
} from '@/modules/apps/types';
import { buildDnsInstructions, sanitizeAppSlug, toSystemdServiceName } from './rendering';
import {
  defaultCommandRunner,
  deployNextJsApp,
  type CommandRunner,
  type DeployNextJsAppResult,
} from './deploy';
import { getAppRepositoryRoot, getAppRoot } from './paths';
import { isHttpsGitUrl, prepareGitSourceForDeploy } from './git';

const DOMAIN_PATTERN = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const DEFAULT_SYSTEMD_DIR = '/etc/systemd/system';
const DEFAULT_NGINX_AVAILABLE_DIR = '/etc/nginx/sites-available';
const DEFAULT_NGINX_ENABLED_DIR = '/etc/nginx/sites-enabled';

export const NextJsAppTemplate: AppTemplate = {
  id: 'nextjs',
  name: 'Next.js App',
  description: 'Deploy a pure Next.js application from a managed release copy.',
  defaultHealthCheckPath: '/',
  requiredCommands: ['install', 'build', 'start'],
  todos: [
    'Auto-detect package manager and commands',
    'Detect Next.js standalone output',
    'Detect environment keys from .env.example',
  ],
};

const templates: Record<string, AppTemplate> = {
  [NextJsAppTemplate.id]: NextJsAppTemplate,
};

export const CreateManagedAppSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    sourceType: z.enum(['local', 'git']).default('local'),
    sourcePath: z.string().trim().min(1).optional(),
    gitUrl: z.string().trim().optional(),
    gitBranch: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._/-]+$/, 'Invalid git branch')
      .default('main'),
    autoUpdate: z
      .object({
        enabled: z.boolean().default(false),
        intervalMinutes: z.number().int().min(5).max(10080).default(60),
      })
      .default({ enabled: false, intervalMinutes: 60 }),
    domain: z.string().trim().toLowerCase().regex(DOMAIN_PATTERN, 'Invalid domain'),
    port: z.number().int().min(1).max(65535),
    commands: z.object({
      install: z.string().trim().min(1),
      build: z.string().trim().min(1),
      start: z.string().trim().min(1),
    }),
    envVars: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string()).default({}),
    healthCheckPath: z
      .string()
      .trim()
      .regex(/^\/[^\s]*$/, 'Health check path must start with /')
      .default('/'),
    tlsEnabled: z.boolean().default(false),
    templateId: z.enum(['nextjs']).default('nextjs'),
  })
  .superRefine((value, ctx) => {
    if (value.sourceType === 'local' && !value.sourcePath) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourcePath'],
        message: 'Source path is required for local apps',
      });
    }
    if (value.sourceType === 'git') {
      if (!value.gitUrl || !isHttpsGitUrl(value.gitUrl)) {
        ctx.addIssue({
          code: 'custom',
          path: ['gitUrl'],
          message: 'Git URL must be an HTTPS URL',
        });
      }
    }
    if (value.sourceType !== 'git' && value.autoUpdate.enabled) {
      ctx.addIssue({
        code: 'custom',
        path: ['autoUpdate', 'enabled'],
        message: 'Auto update is only available for git apps',
      });
    }
  });

export type CreateManagedAppData = z.infer<typeof CreateManagedAppSchema>;

export function getAppTemplate(id: string): AppTemplate | undefined {
  return templates[id];
}

export function getAppTemplates(): AppTemplate[] {
  return Object.values(templates);
}

export function getConfiguredPublicIp(): string | undefined {
  const value = process.env.SERVERMON_PUBLIC_IP || process.env.PUBLIC_IP;
  return value && isIP(value) ? value : undefined;
}

export function normalizeCreateManagedAppInput(input: CreateManagedAppData) {
  return {
    name: input.name,
    slug: sanitizeAppSlug(input.name),
    templateId: input.templateId,
    sourceType: input.sourceType,
    sourcePath: input.sourceType === 'local' ? input.sourcePath : undefined,
    gitUrl: input.sourceType === 'git' ? input.gitUrl : undefined,
    gitBranch: input.sourceType === 'git' ? input.gitBranch : undefined,
    domain: input.domain,
    port: input.port,
    commands: input.commands,
    envVars: input.envVars,
    healthCheckPath: input.healthCheckPath,
    tlsEnabled: input.tlsEnabled,
    status: 'draft' as ManagedAppStatus,
    releases: [],
    autoUpdate: {
      enabled: input.sourceType === 'git' ? input.autoUpdate.enabled : false,
      intervalMinutes: input.autoUpdate.intervalMinutes,
      ...(input.sourceType === 'git' && input.autoUpdate.enabled
        ? { nextRunAt: nextAutoUpdateRun(input.autoUpdate.intervalMinutes) }
        : {}),
    },
  };
}

function mapEnv(value: Map<string, string> | Record<string, string>): Record<string, string> {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value;
}

function toIsoDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

interface ManagedAppDTORecord {
  _id: { toString: () => string };
  name: string;
  slug: string;
  templateId: 'nextjs';
  sourceType?: 'local' | 'git';
  sourcePath?: string;
  gitUrl?: string;
  gitBranch?: string;
  gitCurrentSha?: string;
  gitLastCheckedAt?: Date | string;
  gitLastUpdatedAt?: Date | string;
  autoUpdate?: {
    enabled: boolean;
    intervalMinutes: number;
    nextRunAt?: Date | string;
    lastRunAt?: Date | string;
    lastStatus?: 'idle' | 'updated' | 'unchanged' | 'failed';
    lastError?: string;
  };
  domain: string;
  port: number;
  commands: IManagedApp['commands'];
  envVars: Map<string, string> | Record<string, string>;
  healthCheckPath: string;
  tlsEnabled?: boolean;
  status: IManagedApp['status'];
  currentReleaseId?: string;
  releases: Array<{
    id: string;
    status: 'building' | 'active' | 'failed' | 'superseded';
    createdAt: Date | string;
    activatedAt?: Date | string;
    error?: string;
    logs: string[];
  }>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lastDeployedAt?: Date | string;
}

function mapAutoUpdate(value: ManagedAppDTORecord['autoUpdate']): AppAutoUpdate {
  return {
    enabled: Boolean(value?.enabled),
    intervalMinutes: value?.intervalMinutes ?? 60,
    nextRunAt: toIsoDate(value?.nextRunAt),
    lastRunAt: toIsoDate(value?.lastRunAt),
    lastStatus: value?.lastStatus,
    lastError: value?.lastError,
  };
}

export function mapManagedAppToDTO(app: ManagedAppDTORecord, publicIp?: string): ManagedAppDTO {
  const sourceType = app.sourceType ?? 'local';
  return {
    id: app._id.toString(),
    name: app.name,
    slug: app.slug,
    templateId: app.templateId,
    sourceType,
    sourcePath: app.sourcePath,
    git:
      sourceType === 'git' && app.gitUrl
        ? {
            url: app.gitUrl,
            branch: app.gitBranch ?? 'main',
            currentSha: app.gitCurrentSha,
            lastCheckedAt: toIsoDate(app.gitLastCheckedAt),
            lastUpdatedAt: toIsoDate(app.gitLastUpdatedAt),
            autoUpdate: mapAutoUpdate(app.autoUpdate),
          }
        : undefined,
    domain: app.domain,
    port: app.port,
    commands: app.commands,
    envVars: mapEnv(app.envVars),
    healthCheckPath: app.healthCheckPath,
    tlsEnabled: Boolean(app.tlsEnabled),
    status: app.status,
    currentReleaseId: app.currentReleaseId,
    releases: app.releases.map((release) => ({
      id: release.id,
      status: release.status,
      createdAt: toIsoDate(release.createdAt) ?? new Date(0).toISOString(),
      activatedAt: toIsoDate(release.activatedAt),
      error: release.error,
      logs: release.logs,
    })),
    dns: publicIp ? buildDnsInstructions(app.domain, publicIp) : undefined,
    createdAt: toIsoDate(app.createdAt),
    updatedAt: toIsoDate(app.updatedAt),
    lastDeployedAt: toIsoDate(app.lastDeployedAt),
  };
}

function nextAutoUpdateRun(intervalMinutes: number, from = new Date()): Date {
  return new Date(from.getTime() + intervalMinutes * 60_000);
}

function resolveDeploySourcePath(app: IManagedApp): string {
  if ((app.sourceType ?? 'local') === 'local') {
    if (!app.sourcePath) throw new Error('Local source path is missing');
    return app.sourcePath;
  }
  return getAppRepositoryRoot(app.slug);
}

async function prepareSource(app: IManagedApp, updateToRemote: boolean) {
  if ((app.sourceType ?? 'local') === 'local') {
    return {
      sourcePath: resolveDeploySourcePath(app),
      logs: [] as string[],
      currentSha: undefined,
      remoteSha: undefined,
      changed: false,
    };
  }

  if (!app.gitUrl) throw new Error('Git URL is missing');
  const prepared = await prepareGitSourceForDeploy({
    repoUrl: app.gitUrl,
    branch: app.gitBranch ?? 'main',
    repositoryPath: getAppRepositoryRoot(app.slug),
    updateToRemote,
    commandRunner: defaultCommandRunner,
  });
  return prepared;
}

async function deployPreparedApp(
  app: IManagedApp,
  sourcePath: string
): Promise<DeployNextJsAppResult> {
  return deployNextJsApp({
    app: {
      name: app.name,
      slug: app.slug,
      templateId: app.templateId,
      sourceType: app.sourceType,
      sourcePath,
      gitUrl: app.gitUrl,
      gitBranch: app.gitBranch,
      autoUpdate: {
        enabled: app.autoUpdate?.enabled,
        intervalMinutes: app.autoUpdate?.intervalMinutes,
      },
      domain: app.domain,
      port: app.port,
      commands: app.commands,
      envVars: mapEnv(app.envVars),
      healthCheckPath: app.healthCheckPath,
      tlsEnabled: app.tlsEnabled,
      status: app.status,
      currentReleaseId: app.currentReleaseId,
    },
  });
}

export async function listManagedApps(publicIp?: string): Promise<ManagedAppDTO[]> {
  await connectDB();
  const apps = await ManagedApp.find({}).sort({ updatedAt: -1 }).lean<IManagedApp[]>();
  return apps.map((app) => mapManagedAppToDTO(app, publicIp));
}

export async function createManagedApp(
  input: CreateManagedAppInput,
  publicIp?: string
): Promise<ManagedAppDTO> {
  const parsed = CreateManagedAppSchema.parse(input);
  await connectDB();
  const app = await ManagedApp.create(normalizeCreateManagedAppInput(parsed));
  return mapManagedAppToDTO(app, publicIp);
}

export interface DeleteManagedAppResourcesOptions {
  app: {
    slug: string;
    domain: string;
    tlsEnabled?: boolean;
  };
  appsRoot?: string;
  systemdDir?: string;
  nginxAvailableDir?: string;
  nginxEnabledDir?: string;
  commandRunner?: CommandRunner;
}

export async function deleteManagedAppResources({
  app,
  appsRoot,
  systemdDir = DEFAULT_SYSTEMD_DIR,
  nginxAvailableDir = DEFAULT_NGINX_AVAILABLE_DIR,
  nginxEnabledDir = DEFAULT_NGINX_ENABLED_DIR,
  commandRunner = defaultCommandRunner,
}: DeleteManagedAppResourcesOptions): Promise<{ logs: string[] }> {
  const logs: string[] = [];
  const serviceName = toSystemdServiceName(app.slug);
  const appRoot = getAppRoot(app.slug, appsRoot);

  const runBestEffort = async (command: string) => {
    logs.push(`$ ${command}`);
    const result = await commandRunner({ command });
    if (result.output.trim()) logs.push(result.output.trim());
    if (result.code !== 0) logs.push(`Command exited with code ${result.code}`);
  };

  await runBestEffort(`systemctl stop ${serviceName}`);
  await runBestEffort(`systemctl disable ${serviceName}`);

  await rm(appRoot, { recursive: true, force: true });
  logs.push('Removed managed app root');

  await rm(path.join(systemdDir, serviceName), { force: true });
  logs.push('Removed systemd unit');

  await rm(path.join(nginxEnabledDir, app.domain), { force: true });
  await rm(path.join(nginxAvailableDir, app.domain), { force: true });
  logs.push('Removed Nginx site configuration');

  if (app.tlsEnabled) {
    await runBestEffort(`certbot delete --cert-name ${app.domain} --non-interactive`);
  }

  await runBestEffort('systemctl daemon-reload');
  await runBestEffort('nginx -t');
  await runBestEffort('nginx -s reload');

  return { logs };
}

export async function deleteManagedApp(appId: string) {
  await connectDB();
  const app = await ManagedApp.findById(appId);
  if (!app) throw new Error('App not found');

  const result = await deleteManagedAppResources({
    app: {
      slug: app.slug,
      domain: app.domain,
      tlsEnabled: app.tlsEnabled,
    },
  });
  await app.deleteOne();

  return {
    id: appId,
    logs: result.logs,
  };
}

export async function deployManagedApp(appId: string) {
  await connectDB();
  const app = await ManagedApp.findById(appId);
  if (!app) throw new Error('App not found');

  app.status = 'deploying';
  await app.save();

  let source: Awaited<ReturnType<typeof prepareSource>>;
  try {
    source = await prepareSource(app, false);
  } catch (error) {
    app.status = 'failed';
    await app.save();
    throw error;
  }
  const result = await deployPreparedApp(app, source.sourcePath);
  result.logs.unshift(...source.logs);

  const now = new Date();
  if ((app.sourceType ?? 'local') === 'git') {
    app.gitCurrentSha = source.currentSha;
    app.gitLastCheckedAt = now;
  }
  if (result.status === 'active') {
    app.releases = app.releases.map((release) =>
      release.status === 'active' ? { ...release, status: 'superseded' } : release
    );
    app.currentReleaseId = result.releaseId;
    app.status = 'running';
    app.lastDeployedAt = now;
    app.releases.push({
      id: result.releaseId,
      status: 'active',
      createdAt: now,
      activatedAt: now,
      logs: result.logs,
    });
  } else {
    app.status = 'failed';
    app.releases.push({
      id: result.releaseId,
      status: 'failed',
      createdAt: now,
      error: result.error,
      logs: result.logs,
    });
  }

  await app.save();
  return {
    ...result,
    app: mapManagedAppToDTO(app),
  };
}

export async function updateManagedGitApp(appId: string) {
  await connectDB();
  const app = await ManagedApp.findById(appId);
  if (!app) throw new Error('App not found');
  if ((app.sourceType ?? 'local') !== 'git') throw new Error('Only git apps can be updated');

  const now = new Date();
  let source: Awaited<ReturnType<typeof prepareSource>>;
  try {
    source = await prepareSource(app, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Git update failed';
    app.autoUpdate = {
      ...app.autoUpdate,
      lastRunAt: now,
      lastStatus: 'failed',
      lastError: message,
      nextRunAt: app.autoUpdate?.enabled
        ? nextAutoUpdateRun(app.autoUpdate.intervalMinutes, now)
        : undefined,
    };
    await app.save();
    throw error;
  }
  app.gitCurrentSha = source.currentSha;
  app.gitLastCheckedAt = now;

  if (!source.changed && app.currentReleaseId) {
    app.autoUpdate = {
      ...app.autoUpdate,
      lastRunAt: now,
      lastStatus: 'unchanged',
      lastError: undefined,
      nextRunAt: app.autoUpdate?.enabled
        ? nextAutoUpdateRun(app.autoUpdate.intervalMinutes, now)
        : undefined,
    };
    await app.save();
    return {
      releaseId: app.currentReleaseId,
      status: 'unchanged' as const,
      logs: [...source.logs, 'No upstream changes found.'],
      app: mapManagedAppToDTO(app),
    };
  }

  const previousStatus = app.status;
  const previousReleaseId = app.currentReleaseId;
  if (!previousReleaseId) {
    app.status = 'deploying';
    await app.save();
  }

  const result = await deployPreparedApp(app, source.sourcePath);
  result.logs.unshift(...source.logs);
  const completedAt = new Date();
  app.gitCurrentSha = source.currentSha;
  app.gitLastUpdatedAt = completedAt;

  if (result.status === 'active') {
    app.releases = app.releases.map((release) =>
      release.status === 'active' ? { ...release, status: 'superseded' } : release
    );
    app.currentReleaseId = result.releaseId;
    app.status = 'running';
    app.lastDeployedAt = completedAt;
    app.releases.push({
      id: result.releaseId,
      status: 'active',
      createdAt: completedAt,
      activatedAt: completedAt,
      logs: result.logs,
    });
    app.autoUpdate = {
      ...app.autoUpdate,
      lastRunAt: completedAt,
      lastStatus: 'updated',
      lastError: undefined,
      nextRunAt: app.autoUpdate?.enabled
        ? nextAutoUpdateRun(app.autoUpdate.intervalMinutes, completedAt)
        : undefined,
    };
  } else {
    app.status = previousReleaseId ? previousStatus : 'failed';
    app.releases.push({
      id: result.releaseId,
      status: 'failed',
      createdAt: completedAt,
      error: result.error,
      logs: result.logs,
    });
    app.autoUpdate = {
      ...app.autoUpdate,
      lastRunAt: completedAt,
      lastStatus: 'failed',
      lastError: result.error,
      nextRunAt: app.autoUpdate?.enabled
        ? nextAutoUpdateRun(app.autoUpdate.intervalMinutes, completedAt)
        : undefined,
    };
  }

  await app.save();
  return {
    ...result,
    app: mapManagedAppToDTO(app),
  };
}
