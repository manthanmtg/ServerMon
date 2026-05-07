import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { z } from 'zod';
import connectDB from '@/lib/db';
import ManagedDatabase, { type IManagedDatabase } from '@/models/ManagedDatabase';
import type {
  CreateManagedDatabaseInput,
  DatabaseRestartPolicy,
  DatabaseRuntimeAction,
  DatabaseTemplateId,
  ManagedDatabaseDTO,
  ManagedDatabaseStatus,
} from '@/modules/databases/types';
import {
  buildDatabaseConnectionDetails,
  getDatabaseDataPath,
  getDatabaseTemplate,
  getDatabasesRoot,
} from './templates';

const execFileAsync = promisify(execFile);
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export const CreateManagedDatabaseSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(NAME_PATTERN, 'Use letters, numbers, spaces, dots, dashes, or underscores'),
    templateId: z.enum(['mongo', 'postgres', 'mysql']),
    version: z.string().trim().min(1).max(12),
    port: z.number().int().min(1).max(65535),
    username: z.string().trim().regex(IDENTIFIER_PATTERN, 'Invalid username'),
    password: z.string().min(8).max(256),
    databaseName: z.string().trim().regex(IDENTIFIER_PATTERN, 'Invalid database name'),
    publicRoute: z.boolean().default(false),
    publicHost: z.string().trim().min(1).max(253).optional(),
    sslMode: z.enum(['disable', 'prefer', 'require']).default('disable'),
    restartPolicy: z
      .enum(['unless-stopped', 'always', 'on-failure', 'no'])
      .default('unless-stopped'),
    extraEnv: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string()).default({}),
  })
  .superRefine((value, ctx) => {
    const template = getDatabaseTemplate(value.templateId);
    if (!template.versions.includes(value.version)) {
      ctx.addIssue({
        code: 'custom',
        path: ['version'],
        message: `${template.name} ${value.version} is not supported yet`,
      });
    }
    if (value.templateId === 'mysql' && value.username === 'root') {
      ctx.addIssue({
        code: 'custom',
        path: ['username'],
        message: 'Use an application username; root is managed internally for MySQL',
      });
    }
  });

export type CreateManagedDatabaseData = z.infer<typeof CreateManagedDatabaseSchema>;

export const UpdateManagedDatabaseSchema = CreateManagedDatabaseSchema;
export type UpdateManagedDatabaseData = z.infer<typeof UpdateManagedDatabaseSchema>;

export interface DockerRunRequest {
  containerName: string;
  args: string[];
}

export interface DockerRunner {
  run(args: string[], timeoutMs?: number): Promise<{ code: number; output: string }>;
}

export const defaultDockerRunner: DockerRunner = {
  async run(args, timeoutMs = 60_000) {
    try {
      const { stdout, stderr } = await execFileAsync('docker', args, {
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      });
      return { code: 0, output: `${stdout}${stderr}`.trim() };
    } catch (error: unknown) {
      const err = error as { code?: number; stdout?: string; stderr?: string; message?: string };
      return {
        code: typeof err.code === 'number' ? err.code : 1,
        output: err.stderr?.trim() || err.stdout?.trim() || err.message || 'Docker command failed',
      };
    }
  },
};

export function sanitizeDatabaseSlug(value: string): string {
  if (value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new Error('Database slug must not contain path traversal');
  }
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    throw new Error('Database slug must start and end with a letter or number');
  }
  return slug;
}

export function getConfiguredPublicHost(): string | undefined {
  return (
    process.env.SERVERMON_PUBLIC_HOST || process.env.SERVERMON_PUBLIC_IP || process.env.PUBLIC_IP
  );
}

export function normalizeCreateManagedDatabaseInput(
  input: CreateManagedDatabaseData,
  databasesRoot = getDatabasesRoot()
) {
  const template = getDatabaseTemplate(input.templateId);
  const slug = sanitizeDatabaseSlug(input.name);
  const bindAddress: '127.0.0.1' | '0.0.0.0' = input.publicRoute ? '0.0.0.0' : '127.0.0.1';
  const host = input.publicRoute
    ? input.publicHost || getConfiguredPublicHost() || 'server-public-ip'
    : '127.0.0.1';

  return {
    name: input.name,
    slug,
    templateId: input.templateId,
    version: input.version,
    image: `${template.image}:${input.version}`,
    host,
    port: input.port,
    internalPort: template.internalPort,
    username: input.username,
    password: input.password,
    databaseName: input.databaseName,
    dataPath: getDatabaseDataPath(slug, databasesRoot),
    publicRoute: input.publicRoute,
    bindAddress,
    sslMode: input.sslMode,
    restartPolicy: input.restartPolicy,
    extraEnv: input.extraEnv,
    status: 'draft' as ManagedDatabaseStatus,
    logs: [] as string[],
  };
}

function envForDatabase(input: {
  templateId: DatabaseTemplateId;
  username: string;
  password: string;
  databaseName: string;
  extraEnv?: Record<string, string>;
}): Record<string, string> {
  if (input.templateId === 'mongo') {
    return {
      MONGO_INITDB_ROOT_USERNAME: input.username,
      MONGO_INITDB_ROOT_PASSWORD: input.password,
      MONGO_INITDB_DATABASE: input.databaseName,
      ...(input.extraEnv ?? {}),
    };
  }
  if (input.templateId === 'postgres') {
    return {
      POSTGRES_USER: input.username,
      POSTGRES_PASSWORD: input.password,
      POSTGRES_DB: input.databaseName,
      ...(input.extraEnv ?? {}),
    };
  }
  return {
    MYSQL_USER: input.username,
    MYSQL_PASSWORD: input.password,
    MYSQL_DATABASE: input.databaseName,
    MYSQL_ROOT_PASSWORD: input.password,
    ...(input.extraEnv ?? {}),
  };
}

export function buildDockerRunRequest(input: {
  slug: string;
  templateId: DatabaseTemplateId;
  version: string;
  image: string;
  port: number;
  internalPort: number;
  username: string;
  password: string;
  databaseName: string;
  dataPath: string;
  bindAddress: '127.0.0.1' | '0.0.0.0';
  restartPolicy: DatabaseRestartPolicy;
  extraEnv?: Record<string, string>;
}): DockerRunRequest {
  const template = getDatabaseTemplate(input.templateId);
  const containerName = `servermon-db-${sanitizeDatabaseSlug(input.slug)}`;
  const args = [
    'run',
    '-d',
    '--name',
    containerName,
    '--restart',
    input.restartPolicy,
    '-p',
    `${input.bindAddress}:${input.port}:${input.internalPort}`,
    '-v',
    `${input.dataPath}:${template.dataMountPath}`,
  ];

  for (const [key, value] of Object.entries(
    envForDatabase({
      templateId: input.templateId,
      username: input.username,
      password: input.password,
      databaseName: input.databaseName,
      extraEnv: input.extraEnv,
    })
  )) {
    args.push('-e', `${key}=${value}`);
  }

  args.push(input.image);
  return { containerName, args };
}

function toObjectEnv(
  value: Map<string, string> | Record<string, string> | undefined
): Record<string, string> {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value;
}

function toIsoDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

interface ManagedDatabaseDTORecord {
  _id: { toString: () => string };
  name: string;
  slug: string;
  templateId: DatabaseTemplateId;
  version: string;
  image: string;
  host: string;
  port: number;
  internalPort: number;
  username: string;
  password: string;
  databaseName: string;
  dataPath: string;
  publicRoute: boolean;
  bindAddress: '127.0.0.1' | '0.0.0.0';
  sslMode: 'disable' | 'prefer' | 'require';
  restartPolicy: DatabaseRestartPolicy;
  extraEnv?: Map<string, string> | Record<string, string>;
  status: ManagedDatabaseStatus;
  containerId?: string;
  containerName?: string;
  logs: string[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lastDeployedAt?: Date | string;
}

export function buildSecurityNotes(
  db: Pick<ManagedDatabaseDTORecord, 'publicRoute' | 'port' | 'bindAddress'>
): string[] {
  const notes = ['Database data is stored on this machine in the managed data directory.'];
  if (db.publicRoute || db.bindAddress === '0.0.0.0') {
    notes.push(
      'If this machine is part of ServerMon Fleet with no public IP, do not use public route here.'
    );
    notes.push(
      'Deploy the database first, then configure your public route once the database is up using host 127.0.0.1 and this database port.'
    );
    notes.push(
      `Public exposure binds the native database TCP port ${db.port}; restrict firewall access and prefer private networks or DB-native TLS.`
    );
  } else {
    notes.push('Local-only mode binds to 127.0.0.1 so remote hosts cannot connect directly.');
  }
  return notes;
}

export function mapManagedDatabaseToDTO(db: ManagedDatabaseDTORecord): ManagedDatabaseDTO {
  return {
    id: db._id.toString(),
    name: db.name,
    slug: db.slug,
    templateId: db.templateId,
    version: db.version,
    image: db.image,
    host: db.host,
    port: db.port,
    internalPort: db.internalPort,
    username: db.username,
    databaseName: db.databaseName,
    dataPath: db.dataPath,
    publicRoute: db.publicRoute,
    bindAddress: db.bindAddress,
    sslMode: db.sslMode,
    restartPolicy: db.restartPolicy,
    status: db.status,
    containerId: db.containerId,
    containerName: db.containerName,
    connection: buildDatabaseConnectionDetails({
      templateId: db.templateId,
      host: db.host,
      port: db.port,
      username: db.username,
      password: db.password,
      databaseName: db.databaseName,
      sslMode: db.sslMode,
      includeSecret: false,
    }),
    securityNotes: buildSecurityNotes(db),
    logs: db.logs ?? [],
    createdAt: toIsoDate(db.createdAt),
    updatedAt: toIsoDate(db.updatedAt),
    lastDeployedAt: toIsoDate(db.lastDeployedAt),
  };
}

export async function listManagedDatabases(): Promise<ManagedDatabaseDTO[]> {
  await connectDB();
  const databases = await ManagedDatabase.find({})
    .sort({ updatedAt: -1 })
    .lean<IManagedDatabase[]>();
  return databases.map((db) => mapManagedDatabaseToDTO(db));
}

export async function createManagedDatabase(
  input: CreateManagedDatabaseInput
): Promise<ManagedDatabaseDTO> {
  const parsed = CreateManagedDatabaseSchema.parse(input);
  await connectDB();
  const created = await ManagedDatabase.create(normalizeCreateManagedDatabaseInput(parsed));
  return mapManagedDatabaseToDTO(created);
}

export async function updateManagedDatabase(
  id: string,
  input: CreateManagedDatabaseInput
): Promise<ManagedDatabaseDTO> {
  const parsed = UpdateManagedDatabaseSchema.parse(input);
  await connectDB();
  const db = await ManagedDatabase.findById(id);
  if (!db) throw new Error('Database not found');
  if (db.status === 'running')
    throw new Error('Stop the database before changing runtime settings');

  const next = normalizeCreateManagedDatabaseInput(parsed);
  db.name = next.name;
  db.templateId = next.templateId;
  db.version = next.version;
  db.image = next.image;
  db.host = next.host;
  db.port = next.port;
  db.internalPort = next.internalPort;
  db.username = next.username;
  db.password = next.password;
  db.databaseName = next.databaseName;
  db.publicRoute = next.publicRoute;
  db.bindAddress = next.bindAddress;
  db.sslMode = next.sslMode;
  db.restartPolicy = next.restartPolicy;
  db.extraEnv = new Map(Object.entries(next.extraEnv)) as IManagedDatabase['extraEnv'];
  await db.save();
  return mapManagedDatabaseToDTO(db);
}

async function runOrThrow(
  runner: DockerRunner,
  args: string[],
  logs: string[],
  timeoutMs?: number
) {
  logs.push(`$ docker ${args.join(' ')}`);
  const result = await runner.run(args, timeoutMs);
  if (result.output) logs.push(result.output);
  if (result.code !== 0) throw new Error(result.output || `docker ${args[0]} failed`);
  return result.output;
}

export async function deployManagedDatabase(
  id: string,
  runner: DockerRunner = defaultDockerRunner
): Promise<ManagedDatabaseDTO> {
  await connectDB();
  const db = await ManagedDatabase.findById(id);
  if (!db) throw new Error('Database not found');

  const logs = [...(db.logs ?? [])];
  db.status = 'deploying';
  await db.save();

  try {
    await mkdir(db.dataPath, { recursive: true });
    const request = buildDockerRunRequest({
      slug: db.slug,
      templateId: db.templateId,
      version: db.version,
      image: db.image,
      port: db.port,
      internalPort: db.internalPort,
      username: db.username,
      password: db.password,
      databaseName: db.databaseName,
      dataPath: db.dataPath,
      bindAddress: db.bindAddress,
      restartPolicy: db.restartPolicy,
      extraEnv: toObjectEnv(db.extraEnv),
    });
    await runner.run(['rm', '-f', request.containerName]);
    await runOrThrow(runner, ['pull', db.image], logs, 180_000);
    const containerId = await runOrThrow(runner, request.args, logs, 60_000);
    db.containerName = request.containerName;
    db.containerId = containerId.trim();
    db.status = 'running';
    db.lastDeployedAt = new Date();
    db.logs = logs.slice(-200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database deployment failed';
    logs.push(`ERROR: ${message}`);
    db.status = 'failed';
    db.logs = logs.slice(-200);
  }

  await db.save();
  return mapManagedDatabaseToDTO(db);
}

export async function performManagedDatabaseAction(
  id: string,
  action: DatabaseRuntimeAction,
  runner: DockerRunner = defaultDockerRunner
): Promise<ManagedDatabaseDTO> {
  await connectDB();
  const db = await ManagedDatabase.findById(id);
  if (!db) throw new Error('Database not found');
  const containerName = db.containerName || `servermon-db-${db.slug}`;
  const logs = [...(db.logs ?? [])];
  await runOrThrow(runner, [action, containerName], logs);
  db.status = action === 'stop' ? 'stopped' : 'running';
  db.logs = logs.slice(-200);
  await db.save();
  return mapManagedDatabaseToDTO(db);
}

export async function deleteManagedDatabase(
  id: string,
  runner: DockerRunner = defaultDockerRunner
): Promise<{ id: string; logs: string[] }> {
  await connectDB();
  const db = await ManagedDatabase.findById(id);
  if (!db) throw new Error('Database not found');
  const logs = [...(db.logs ?? [])];
  const containerName = db.containerName || `servermon-db-${db.slug}`;
  await runner.run(['rm', '-f', containerName]);
  await rm(db.dataPath, { recursive: true, force: true });
  logs.push('Removed managed database container and data directory');
  await db.deleteOne();
  return { id, logs };
}
