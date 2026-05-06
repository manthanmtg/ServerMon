import { z } from 'zod';
import { isIP } from 'node:net';
import connectDB from '@/lib/db';
import ManagedApp, { type IManagedApp } from '@/models/ManagedApp';
import type {
  AppTemplate,
  CreateManagedAppInput,
  ManagedAppDTO,
  ManagedAppStatus,
} from '@/modules/apps/types';
import { buildDnsInstructions, maskEnvVars, sanitizeAppSlug } from './rendering';
import { deployNextJsApp } from './deploy';

const DOMAIN_PATTERN = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

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

export const CreateManagedAppSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sourcePath: z.string().trim().min(1),
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
  templateId: z.enum(['nextjs']).default('nextjs'),
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
    sourcePath: input.sourcePath,
    domain: input.domain,
    port: input.port,
    commands: input.commands,
    envVars: input.envVars,
    healthCheckPath: input.healthCheckPath,
    status: 'draft' as ManagedAppStatus,
    releases: [],
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
  sourcePath: string;
  domain: string;
  port: number;
  commands: IManagedApp['commands'];
  envVars: Map<string, string> | Record<string, string>;
  healthCheckPath: string;
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

export function mapManagedAppToDTO(app: ManagedAppDTORecord, publicIp?: string): ManagedAppDTO {
  return {
    id: app._id.toString(),
    name: app.name,
    slug: app.slug,
    templateId: app.templateId,
    sourcePath: app.sourcePath,
    domain: app.domain,
    port: app.port,
    commands: app.commands,
    envVars: maskEnvVars(mapEnv(app.envVars)),
    healthCheckPath: app.healthCheckPath,
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

export async function deployManagedApp(appId: string) {
  await connectDB();
  const app = await ManagedApp.findById(appId);
  if (!app) throw new Error('App not found');

  app.status = 'deploying';
  await app.save();

  const result = await deployNextJsApp({
    app: {
      name: app.name,
      slug: app.slug,
      templateId: app.templateId,
      sourcePath: app.sourcePath,
      domain: app.domain,
      port: app.port,
      commands: app.commands,
      envVars: mapEnv(app.envVars),
      healthCheckPath: app.healthCheckPath,
      status: app.status,
      currentReleaseId: app.currentReleaseId,
    },
  });

  const now = new Date();
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
