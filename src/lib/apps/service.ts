import { z } from 'zod';
import { isIP } from 'node:net';
import { access, readlink, rename, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import connectDB from '@/lib/db';
import ManagedApp, { type IManagedApp } from '@/models/ManagedApp';
import type {
  AppAutoUpdate,
  AppOperation,
  AppOperationStatus,
  AppOperationType,
  AppRuntimeSnapshot,
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
  type HealthCheck,
} from './deploy';
import { getAppRepositoryRoot, getAppRoot, getReleaseRoot } from './paths';
import { isHttpsGitUrl, prepareGitSourceForDeploy } from './git';
import { getManagedAppLogs, getManagedAppRuntime } from './runtime';

const DOMAIN_PATTERN = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const DEFAULT_SYSTEMD_DIR = '/etc/systemd/system';
const DEFAULT_NGINX_AVAILABLE_DIR = '/etc/nginx/sites-available';
const DEFAULT_NGINX_ENABLED_DIR = '/etc/nginx/sites-enabled';
const MAX_APP_OPERATIONS = 20;
const MAX_OPERATION_LOGS = 200;

const NextJsAppTemplate: AppTemplate = {
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
export const UpdateManagedAppSchema = CreateManagedAppSchema;
export type UpdateManagedAppData = z.infer<typeof UpdateManagedAppSchema>;

export function getAppTemplate(id: string): AppTemplate | undefined {
  return templates[id];
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
    operations: [],
    autoUpdate: {
      enabled: input.sourceType === 'git' ? input.autoUpdate.enabled : false,
      intervalMinutes: input.autoUpdate.intervalMinutes,
      ...(input.sourceType === 'git' && input.autoUpdate.enabled
        ? { nextRunAt: nextAutoUpdateRun(input.autoUpdate.intervalMinutes) }
        : {}),
    },
  };
}

function normalizeUpdateManagedAppInput(input: UpdateManagedAppData) {
  return {
    name: input.name,
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
  operations?: Array<{
    id: string;
    type: AppOperationType;
    status: AppOperationStatus;
    title: string;
    step: string;
    startedAt: Date | string;
    completedAt?: Date | string;
    releaseId?: string;
    commitSha?: string;
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

function mapOperations(operations?: ManagedAppDTORecord['operations']): AppOperation[] {
  return (operations ?? []).map((operation) => ({
    id: operation.id,
    type: operation.type,
    status: operation.status,
    title: operation.title,
    step: operation.step,
    startedAt: toIsoDate(operation.startedAt) ?? new Date(0).toISOString(),
    completedAt: toIsoDate(operation.completedAt),
    releaseId: operation.releaseId,
    commitSha: operation.commitSha,
    error: operation.error,
    logs: operation.logs ?? [],
  }));
}

export function mapManagedAppToDTO(
  app: ManagedAppDTORecord,
  publicIp?: string,
  runtime?: AppRuntimeSnapshot
): ManagedAppDTO {
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
    runtime,
    currentReleaseId: app.currentReleaseId,
    releases: app.releases.map((release) => ({
      id: release.id,
      status: release.status,
      createdAt: toIsoDate(release.createdAt) ?? new Date(0).toISOString(),
      activatedAt: toIsoDate(release.activatedAt),
      error: release.error,
      logs: release.logs,
    })),
    operations: mapOperations(app.operations),
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
  sourcePath: string,
  onProgress?: (entry: string) => void | Promise<void>
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
    onProgress,
  });
}

export async function listManagedApps(publicIp?: string): Promise<ManagedAppDTO[]> {
  await connectDB();
  const apps = await ManagedApp.find({}).sort({ updatedAt: -1 }).lean<IManagedApp[]>();
  return Promise.all(
    apps.map(async (app) => {
      const runtime = await getManagedAppRuntime({ slug: app.slug });
      return mapManagedAppToDTO(app, publicIp, runtime);
    })
  );
}

export async function getManagedAppLogsById(appId: string, lines = 200) {
  await connectDB();
  const app = await ManagedApp.findById(appId).lean<IManagedApp | null>();
  if (!app) throw new Error('App not found');
  return getManagedAppLogs({ slug: app.slug }, lines);
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

export async function updateManagedApp(
  appId: string,
  input: CreateManagedAppInput,
  publicIp?: string
): Promise<ManagedAppDTO> {
  const parsed = UpdateManagedAppSchema.parse(input);
  await connectDB();
  const app = await ManagedApp.findById(appId);
  if (!app) throw new Error('App not found');

  const previousGitUrl = app.gitUrl;
  const previousGitBranch = app.gitBranch;
  const previousSourceType = app.sourceType ?? 'local';
  const next = normalizeUpdateManagedAppInput(parsed);

  app.name = next.name;
  app.templateId = next.templateId;
  app.sourceType = next.sourceType;
  app.sourcePath = next.sourcePath;
  app.gitUrl = next.gitUrl;
  app.gitBranch = next.gitBranch;
  app.domain = next.domain;
  app.port = next.port;
  app.commands = next.commands;
  app.envVars = new Map(Object.entries(next.envVars)) as IManagedApp['envVars'];
  app.healthCheckPath = next.healthCheckPath;
  app.tlsEnabled = next.tlsEnabled;
  app.autoUpdate = next.autoUpdate;

  if (
    next.sourceType !== 'git' ||
    previousSourceType !== 'git' ||
    previousGitUrl !== next.gitUrl ||
    previousGitBranch !== next.gitBranch
  ) {
    app.gitCurrentSha = undefined;
    app.gitLastCheckedAt = undefined;
    app.gitLastUpdatedAt = undefined;
  }

  await app.save();
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

function createOperationId(type: AppOperationType): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function startAppOperation(
  app: IManagedApp,
  input: {
    type: AppOperationType;
    title: string;
    step: string;
    releaseId?: string;
    commitSha?: string;
  }
): Promise<string> {
  const operationId = createOperationId(input.type);
  app.operations = [
    ...(app.operations ?? []),
    {
      id: operationId,
      type: input.type,
      status: 'running',
      title: input.title,
      step: input.step,
      startedAt: new Date(),
      releaseId: input.releaseId,
      commitSha: input.commitSha,
      logs: [],
    },
  ].slice(-MAX_APP_OPERATIONS) as IManagedApp['operations'];
  await app.save();
  return operationId;
}

async function appendAppOperationLog(
  app: IManagedApp,
  operationId: string,
  entry: string,
  step = entry
): Promise<void> {
  const operation = app.operations?.find((item) => item.id === operationId);
  if (!operation) return;
  operation.step = step;
  operation.logs = [...(operation.logs ?? []), entry].slice(-MAX_OPERATION_LOGS);
  await app.save();
}

async function completeAppOperation(
  app: IManagedApp,
  operationId: string,
  input: {
    status: AppOperationStatus;
    step: string;
    logs?: string[];
    error?: string;
    releaseId?: string;
    commitSha?: string;
  }
): Promise<void> {
  const operation = app.operations?.find((item) => item.id === operationId);
  if (!operation) return;
  operation.status = input.status;
  operation.step = input.step;
  operation.completedAt = new Date();
  operation.error = input.error;
  operation.releaseId = input.releaseId ?? operation.releaseId;
  operation.commitSha = input.commitSha ?? operation.commitSha;
  operation.logs = input.logs ? input.logs.slice(-MAX_OPERATION_LOGS) : operation.logs;
  await app.save();
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function replaceSymlink(linkPath: string, target: string): Promise<void> {
  const tempLink = `${linkPath}.tmp-${process.pid}-${Date.now()}`;
  await symlink(target, tempLink);
  await rm(linkPath, { recursive: true, force: true });
  await rename(tempLink, linkPath);
}

async function readCurrentTarget(currentPath: string): Promise<string | undefined> {
  try {
    return await readlink(currentPath);
  } catch {
    return undefined;
  }
}

function rollbackHealthUrl(port: number, healthCheckPath?: string): string {
  const normalizedPath = healthCheckPath?.startsWith('/') ? healthCheckPath : '/';
  return `http://127.0.0.1:${port}${normalizedPath}`;
}

export interface UpdateManagedGitAppOptions {
  trigger?: 'manual' | 'auto';
}

const defaultRollbackHealthCheck: HealthCheck = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    return { ok: response.ok, status: response.status };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : 'Health check failed' };
  }
};

export interface RollbackManagedAppOptions {
  commandRunner?: CommandRunner;
  healthCheck?: HealthCheck;
  appsRoot?: string;
}

export async function rollbackManagedApp(
  appId: string,
  releaseId: string,
  {
    commandRunner = defaultCommandRunner,
    healthCheck = defaultRollbackHealthCheck,
    appsRoot,
  }: RollbackManagedAppOptions = {}
) {
  await connectDB();
  const app = await ManagedApp.findById(appId);
  if (!app) throw new Error('App not found');

  const targetRelease = app.releases.find((release) => release.id === releaseId);
  if (!targetRelease || targetRelease.status === 'failed' || targetRelease.status === 'building') {
    throw new Error('Rollback release is not available');
  }

  const releaseRoot = getReleaseRoot(app.slug, releaseId, appsRoot);
  if (!(await pathExists(releaseRoot))) {
    throw new Error('Rollback release files are missing');
  }

  const operationId = await startAppOperation(app, {
    type: 'rollback',
    title: 'Rollback',
    step: `Rolling back to ${releaseId}`,
    releaseId,
  });
  const logs: string[] = [`Rolling back to ${releaseId}`];
  await appendAppOperationLog(app, operationId, logs[0]);

  const currentPath = path.join(getAppRoot(app.slug, appsRoot), 'current');
  const serviceName = toSystemdServiceName(app.slug);
  const previousCurrentTarget = await readCurrentTarget(currentPath);

  try {
    await replaceSymlink(currentPath, releaseRoot);
    const restartCommand = `systemctl restart ${serviceName}`;
    logs.push(`$ ${restartCommand}`);
    await appendAppOperationLog(app, operationId, `$ ${restartCommand}`);
    const restart = await commandRunner({ command: restartCommand });
    if (restart.output.trim()) {
      logs.push(restart.output.trim());
      await appendAppOperationLog(app, operationId, restart.output.trim());
    }
    if (restart.code !== 0) {
      throw new Error(`Command failed: ${restartCommand}\n${restart.output}`.trim());
    }

    const checked = await healthCheck(rollbackHealthUrl(app.port, app.healthCheckPath));
    if (!checked.ok) {
      throw new Error(
        checked.error || `Health check failed${checked.status ? ` with ${checked.status}` : ''}`
      );
    }
    logs.push('Health check passed');
    await appendAppOperationLog(app, operationId, 'Health check passed');

    const now = new Date();
    app.releases = app.releases.map((release) => ({
      ...release,
      status: release.id === releaseId ? 'active' : 'superseded',
      ...(release.id === releaseId ? { activatedAt: now } : {}),
    })) as IManagedApp['releases'];
    app.currentReleaseId = releaseId;
    app.status = 'running';
    app.lastDeployedAt = now;
    await completeAppOperation(app, operationId, {
      status: 'succeeded',
      step: 'Rollback completed',
      logs,
      releaseId,
    });
    await app.save();
    return {
      releaseId,
      status: 'active' as const,
      logs,
      app: mapManagedAppToDTO(app),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Rollback failed';
    if (previousCurrentTarget) {
      await replaceSymlink(currentPath, previousCurrentTarget);
      const restoreCommand = `systemctl restart ${serviceName}`;
      logs.push(`$ ${restoreCommand}`);
      const restored = await commandRunner({ command: restoreCommand });
      if (restored.output.trim()) logs.push(restored.output.trim());
    }
    logs.push(`ERROR: ${message}`);
    app.status = 'failed';
    await completeAppOperation(app, operationId, {
      status: 'failed',
      step: 'Rollback failed',
      logs,
      error: message,
      releaseId,
    });
    await app.save();
    return {
      releaseId,
      status: 'failed' as const,
      logs,
      error: message,
      app: mapManagedAppToDTO(app),
    };
  }
}

export async function deployManagedApp(appId: string) {
  await connectDB();
  const app = await ManagedApp.findById(appId);
  if (!app) throw new Error('App not found');

  const operationId = await startAppOperation(app, {
    type: 'deploy',
    title: 'Manual deploy',
    step: 'Preparing deployment',
  });
  app.status = 'deploying';
  await app.save();

  let source: Awaited<ReturnType<typeof prepareSource>>;
  try {
    source = await prepareSource(app, (app.sourceType ?? 'local') === 'git');
    for (const entry of source.logs) {
      await appendAppOperationLog(app, operationId, entry);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deployment source preparation failed';
    app.status = 'failed';
    await completeAppOperation(app, operationId, {
      status: 'failed',
      step: 'Source preparation failed',
      error: message,
      logs: [message],
    });
    await app.save();
    throw error;
  }
  const result = await deployNextJsApp({
    app: {
      name: app.name,
      slug: app.slug,
      templateId: app.templateId,
      sourceType: app.sourceType,
      sourcePath: source.sourcePath,
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
    onProgress: (entry) => appendAppOperationLog(app, operationId, entry),
  });
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
    await completeAppOperation(app, operationId, {
      status: 'succeeded',
      step: 'Deployment completed',
      logs: result.logs,
      releaseId: result.releaseId,
      commitSha: source.currentSha,
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
    await completeAppOperation(app, operationId, {
      status: 'failed',
      step: 'Deployment failed',
      logs: result.logs,
      error: result.error,
      releaseId: result.releaseId,
      commitSha: source.currentSha,
    });
  }

  await app.save();
  return {
    ...result,
    app: mapManagedAppToDTO(app),
  };
}

export async function updateManagedGitApp(
  appId: string,
  { trigger = 'manual' }: UpdateManagedGitAppOptions = {}
) {
  await connectDB();
  const app = await ManagedApp.findById(appId);
  if (!app) throw new Error('App not found');
  if ((app.sourceType ?? 'local') !== 'git') throw new Error('Only git apps can be updated');

  const now = new Date();
  const operationId = await startAppOperation(app, {
    type: 'update',
    title: trigger === 'auto' ? 'Auto update' : 'Manual update',
    step: 'Checking upstream repository',
  });
  let source: Awaited<ReturnType<typeof prepareSource>>;
  try {
    source = await prepareSource(app, true);
    for (const entry of source.logs) {
      await appendAppOperationLog(app, operationId, entry);
    }
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
    await completeAppOperation(app, operationId, {
      status: 'failed',
      step: 'Git update failed',
      error: message,
      logs: [message],
    });
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
    await completeAppOperation(app, operationId, {
      status: 'unchanged',
      step: 'No upstream changes found',
      logs: [...source.logs, 'No upstream changes found.'],
      releaseId: app.currentReleaseId,
      commitSha: source.currentSha,
    });
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

  const result = await deployPreparedApp(app, source.sourcePath, (entry) =>
    appendAppOperationLog(app, operationId, entry)
  );
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
    await completeAppOperation(app, operationId, {
      status: 'succeeded',
      step: 'Update deployed',
      logs: result.logs,
      releaseId: result.releaseId,
      commitSha: source.currentSha,
    });
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
    await completeAppOperation(app, operationId, {
      status: 'failed',
      step: 'Update deployment failed',
      logs: result.logs,
      error: result.error,
      releaseId: result.releaseId,
      commitSha: source.currentSha,
    });
  }

  await app.save();
  return {
    ...result,
    app: mapManagedAppToDTO(app),
  };
}
