import { execFile } from 'node:child_process';
import { createServer, isIP } from 'node:net';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { access, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { z } from 'zod';
import connectDB from '@/lib/db';
import ManagedDatabase, { type IManagedDatabase } from '@/models/ManagedDatabase';
import type {
  CreateManagedDatabaseInput,
  DatabaseExplorerKind,
  DatabaseExplorerStatus,
  DatabaseRestartPolicy,
  DatabaseRuntimeAction,
  DatabaseSslMode,
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
const MONGO_EXPRESS_IMAGE =
  process.env.SERVERMON_MONGO_EXPRESS_IMAGE || 'mongo-express:1.0.2-20-alpine3.19';
const PGWEB_IMAGE = process.env.SERVERMON_PGWEB_IMAGE || 'sosedoff/pgweb:0.16.2';
const PHPMYADMIN_IMAGE = process.env.SERVERMON_PHPMYADMIN_IMAGE || 'phpmyadmin:5.2.2-apache';
export const DATABASE_EXPLORER_IDLE_TIMEOUT_MINUTES = 30;
export const DATABASE_EXPLORER_IDLE_TIMEOUT_MS = DATABASE_EXPLORER_IDLE_TIMEOUT_MINUTES * 60 * 1000;

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
  internalPort?: number;
}

export interface DockerRunner {
  run(args: string[], timeoutMs?: number): Promise<{ code: number; output: string }>;
}

export interface MongoTlsPaths {
  dir: string;
  caKeyPath: string;
  caCertPath: string;
  caSerialPath: string;
  serverKeyPath: string;
  serverCsrPath: string;
  serverCertPath: string;
  serverPemPath: string;
  opensslConfigPath: string;
}

type HostCommandRunner = (
  file: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>;

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

const defaultHostCommandRunner: HostCommandRunner = async (file, args) => execFileAsync(file, args);
const MONGO_TLS_CONTAINER_DIR = '/etc/servermon-db-tls';
const MONGO_TLS_SERVER_CERT_DAYS = 397;
const MONGO_TLS_SERVER_CERT_RENEWAL_WINDOW_SECONDS = 30 * 24 * 60 * 60;

function fileExists(filePath: string): Promise<boolean> {
  return access(filePath)
    .then(() => true)
    .catch(() => false);
}

function getDatabaseInstanceRoot(dataPath: string): string {
  return path.dirname(dataPath);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildMongoTlsOpenSslConfig(hosts: string[]): string {
  const names = uniqueValues(hosts.length > 0 ? hosts : ['localhost']);
  const altNames = names.map((host, index) => {
    const key = isIP(host) ? `IP.${index + 1}` : `DNS.${index + 1}`;
    return `${key} = ${host}`;
  });

  return [
    '[req]',
    'distinguished_name = req_distinguished_name',
    'req_extensions = v3_req',
    'prompt = no',
    '',
    '[req_distinguished_name]',
    'CN = ServerMon Managed MongoDB',
    '',
    '[v3_req]',
    'basicConstraints = CA:FALSE',
    'keyUsage = digitalSignature, keyEncipherment',
    'extendedKeyUsage = serverAuth',
    'subjectAltName = @alt_names',
    '',
    '[alt_names]',
    ...altNames,
    '',
  ].join('\n');
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function certificateExpiresWithin(
  certPath: string,
  seconds: number,
  runner: HostCommandRunner
): Promise<boolean> {
  try {
    await runner('openssl', ['x509', '-checkend', String(seconds), '-noout', '-in', certPath]);
    return false;
  } catch {
    return true;
  }
}

export function buildMongoTlsPaths(instanceRoot: string): MongoTlsPaths {
  const dir = path.join(instanceRoot, 'tls');
  return {
    dir,
    caKeyPath: path.join(dir, 'ca.key'),
    caCertPath: path.join(dir, 'ca.crt'),
    caSerialPath: path.join(dir, 'ca.srl'),
    serverKeyPath: path.join(dir, 'server.key'),
    serverCsrPath: path.join(dir, 'server.csr'),
    serverCertPath: path.join(dir, 'server.crt'),
    serverPemPath: path.join(dir, 'server.pem'),
    opensslConfigPath: path.join(dir, 'openssl.cnf'),
  };
}

export async function ensureMongoTlsAssets(
  tlsPaths: MongoTlsPaths,
  hosts: string[],
  runner: HostCommandRunner = defaultHostCommandRunner
): Promise<void> {
  await mkdir(tlsPaths.dir, { recursive: true, mode: 0o700 });
  const opensslConfig = buildMongoTlsOpenSslConfig(hosts);
  const existingOpenSslConfig = await readTextFileIfExists(tlsPaths.opensslConfigPath);
  await writeFile(tlsPaths.opensslConfigPath, opensslConfig, { mode: 0o600 });

  const hasCaBundle =
    (await fileExists(tlsPaths.caKeyPath)) && (await fileExists(tlsPaths.caCertPath));
  const hasServerBundle =
    (await fileExists(tlsPaths.serverKeyPath)) &&
    (await fileExists(tlsPaths.serverCertPath)) &&
    (await fileExists(tlsPaths.serverPemPath));
  const serverConfigChanged =
    existingOpenSslConfig !== null && existingOpenSslConfig !== opensslConfig;
  const serverCertificateNearExpiry =
    hasServerBundle &&
    !serverConfigChanged &&
    (await certificateExpiresWithin(
      tlsPaths.serverCertPath,
      MONGO_TLS_SERVER_CERT_RENEWAL_WINDOW_SECONDS,
      runner
    ));

  if (!hasCaBundle) {
    await runner('openssl', ['genrsa', '-out', tlsPaths.caKeyPath, '4096']);
    await runner('openssl', [
      'req',
      '-x509',
      '-new',
      '-nodes',
      '-key',
      tlsPaths.caKeyPath,
      '-sha256',
      '-days',
      '3650',
      '-subj',
      '/CN=ServerMon Managed MongoDB CA',
      '-out',
      tlsPaths.caCertPath,
    ]);
  }

  if (!hasServerBundle || serverConfigChanged || serverCertificateNearExpiry) {
    await runner('openssl', [
      'req',
      '-new',
      '-nodes',
      '-newkey',
      'rsa:4096',
      '-keyout',
      tlsPaths.serverKeyPath,
      '-out',
      tlsPaths.serverCsrPath,
      '-config',
      tlsPaths.opensslConfigPath,
    ]);
    await runner('openssl', [
      'x509',
      '-req',
      '-in',
      tlsPaths.serverCsrPath,
      '-CA',
      tlsPaths.caCertPath,
      '-CAkey',
      tlsPaths.caKeyPath,
      '-CAcreateserial',
      '-out',
      tlsPaths.serverCertPath,
      '-days',
      String(MONGO_TLS_SERVER_CERT_DAYS),
      '-sha256',
      '-extfile',
      tlsPaths.opensslConfigPath,
      '-extensions',
      'v3_req',
    ]);
  }

  const serverKey = await readFile(tlsPaths.serverKeyPath, 'utf8');
  const serverCert = await readFile(tlsPaths.serverCertPath, 'utf8');
  await writeFile(tlsPaths.serverPemPath, `${serverKey.trim()}\n${serverCert.trim()}\n`, {
    mode: 0o600,
  });
  await chmod(tlsPaths.dir, 0o700);
  await chmod(tlsPaths.caKeyPath, 0o600);
  await chmod(tlsPaths.caCertPath, 0o644);
  await chmod(tlsPaths.serverKeyPath, 0o600);
  await chmod(tlsPaths.serverCertPath, 0o644);
  await chmod(tlsPaths.serverPemPath, 0o600);
}

function redactDockerArgs(args: string[]): string[] {
  const redacted: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    const previous = args[index - 1];
    if (previous === '-e' && /PASSWORD|SECRET|TOKEN|KEY/i.test(current)) {
      const [key] = current.split('=');
      redacted.push(`${key}=********`);
    } else {
      redacted.push(current);
    }
  }
  return redacted;
}

function timestampedLog(message: string, date = new Date()): string {
  return `[${date.toISOString()}] ${message}`;
}

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
    explorerStatus: 'stopped' as DatabaseExplorerStatus,
    explorerKind: getExplorerKind(input.templateId),
    explorerLogs: [] as string[],
    explorerIdleTimeoutMinutes: DATABASE_EXPLORER_IDLE_TIMEOUT_MINUTES,
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
  sslMode?: DatabaseSslMode;
  tlsPaths?: MongoTlsPaths;
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

  if (input.templateId === 'mongo' && input.sslMode === 'require') {
    if (!input.tlsPaths) {
      throw new Error('Mongo TLS paths are required when SSL mode is require');
    }
    args.push('-v', `${input.tlsPaths.dir}:${MONGO_TLS_CONTAINER_DIR}:ro`);
  }

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
  if (input.templateId === 'mongo' && input.sslMode === 'require') {
    args.push(
      'mongod',
      '--auth',
      '--bind_ip_all',
      '--tlsMode',
      'requireTLS',
      '--tlsCertificateKeyFile',
      `${MONGO_TLS_CONTAINER_DIR}/server.pem`,
      '--tlsCAFile',
      `${MONGO_TLS_CONTAINER_DIR}/ca.crt`
    );
  }
  return { containerName, args };
}

function getExplorerKind(templateId: DatabaseTemplateId): DatabaseExplorerKind {
  if (templateId === 'mongo') return 'mongo-express';
  if (templateId === 'postgres') return 'pgweb';
  return 'phpmyadmin';
}

function getExplorerImage(templateId: DatabaseTemplateId): string {
  if (templateId === 'mongo') return MONGO_EXPRESS_IMAGE;
  if (templateId === 'postgres') return PGWEB_IMAGE;
  return PHPMYADMIN_IMAGE;
}

function getExplorerInternalPort(templateId: DatabaseTemplateId): number {
  return templateId === 'mysql' ? 80 : 8081;
}

function getExplorerUpstreamBasePath(id: string, kind: DatabaseExplorerKind): string | undefined {
  return kind === 'mongo-express' || kind === 'pgweb' ? buildExplorerProxyPath(id) : undefined;
}

function encodeCredential(value: string): string {
  return encodeURIComponent(value);
}

function buildPostgresExplorerUrl(input: {
  username: string;
  password: string;
  targetHost: string;
  targetPort: number;
  databaseName: string;
}): string {
  return `postgres://${encodeCredential(input.username)}:${encodeCredential(input.password)}@${
    input.targetHost
  }:${input.targetPort}/${encodeCredential(input.databaseName)}?sslmode=disable`;
}

function buildMongoExplorerUrl(input: {
  username: string;
  password: string;
  targetHost: string;
  targetPort: number;
  databaseName: string;
  sslMode?: DatabaseSslMode;
}): string {
  const query = new URLSearchParams({ authSource: 'admin' });
  if (input.sslMode === 'require') query.set('tls', 'true');
  return `mongodb://${encodeCredential(input.username)}:${encodeCredential(input.password)}@${
    input.targetHost
  }:${input.targetPort}/${encodeCredential(input.databaseName)}?${query.toString()}`;
}

export function buildExplorerProxyPath(id: string): string {
  return `/api/modules/databases/${encodeURIComponent(id)}/explore/proxy/`;
}

export function buildDatabaseExplorerRunRequest(input: {
  id: string;
  slug: string;
  templateId: DatabaseTemplateId;
  targetHost: string;
  targetPort: number;
  hostPort: number;
  username: string;
  password: string;
  databaseName: string;
  proxyPath: string;
  networkName?: string;
  sslMode?: DatabaseSslMode;
  tlsPaths?: MongoTlsPaths;
}): DockerRunRequest {
  const containerName = `servermon-db-explorer-${sanitizeDatabaseSlug(input.slug)}`;
  const internalPort = getExplorerInternalPort(input.templateId);
  const image = getExplorerImage(input.templateId);
  const args = [
    'run',
    '-d',
    '--name',
    containerName,
    '--restart',
    'unless-stopped',
    '-p',
    `127.0.0.1:${input.hostPort}:${internalPort}`,
  ];

  if (input.networkName) {
    args.push('--network', input.networkName);
  }

  if (input.templateId === 'mongo' && input.sslMode === 'require') {
    if (!input.tlsPaths) {
      throw new Error('Mongo TLS paths are required for TLS-required Explorer sidecars');
    }
    args.push('-v', `${input.tlsPaths.dir}:${MONGO_TLS_CONTAINER_DIR}:ro`);
  }

  const env: Record<string, string> =
    input.templateId === 'mongo'
      ? {
          ME_CONFIG_MONGODB_URL: buildMongoExplorerUrl(input),
          ME_CONFIG_MONGODB_SERVER: input.targetHost,
          ME_CONFIG_MONGODB_PORT: String(input.targetPort),
          ME_CONFIG_MONGODB_ADMINUSERNAME: input.username,
          ME_CONFIG_MONGODB_ADMINPASSWORD: input.password,
          ME_CONFIG_MONGODB_AUTH_DATABASE: 'admin',
          ME_CONFIG_MONGODB_ENABLE_ADMIN: 'true',
          ME_CONFIG_BASICAUTH: 'false',
          ME_CONFIG_SITE_BASEURL: input.proxyPath,
          ...(input.sslMode === 'require'
            ? {
                ME_CONFIG_MONGODB_TLS: 'true',
                ME_CONFIG_MONGODB_TLS_ALLOW_CERTS: 'false',
                ME_CONFIG_MONGODB_TLS_CA_FILE: `${MONGO_TLS_CONTAINER_DIR}/ca.crt`,
              }
            : {}),
        }
      : input.templateId === 'postgres'
        ? {
            PGWEB_DATABASE_URL: buildPostgresExplorerUrl(input),
          }
        : {
            PMA_HOST: input.targetHost,
            PMA_PORT: String(input.targetPort),
            PMA_USER: input.username,
            PMA_PASSWORD: input.password,
            PMA_ABSOLUTE_URI: input.proxyPath,
          };

  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`);
  }

  args.push(image);

  if (input.templateId === 'postgres') {
    args.push(
      '--bind=0.0.0.0',
      `--listen=${internalPort}`,
      `--prefix=${input.proxyPath.replace(/^\/+|\/+$/g, '')}`
    );
  }

  return { containerName, args, internalPort };
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
  explorerStatus?: DatabaseExplorerStatus;
  explorerKind?: DatabaseExplorerKind;
  explorerImage?: string;
  explorerPort?: number;
  explorerContainerName?: string;
  explorerLogs?: string[];
  explorerStartedAt?: Date | string;
  explorerLastAccessedAt?: Date | string;
  explorerIdleTimeoutMinutes?: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lastDeployedAt?: Date | string;
}

function toDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
}

function getExplorerIdleTimeoutMinutes(
  db: Pick<ManagedDatabaseDTORecord, 'explorerIdleTimeoutMinutes'>
): number {
  return db.explorerIdleTimeoutMinutes ?? DATABASE_EXPLORER_IDLE_TIMEOUT_MINUTES;
}

function getExplorerLastActivityDate(
  db: Pick<ManagedDatabaseDTORecord, 'explorerLastAccessedAt' | 'explorerStartedAt'>
): Date | undefined {
  return toDate(db.explorerLastAccessedAt) ?? toDate(db.explorerStartedAt);
}

export function getExplorerIdleExpiresAt(
  db: Pick<
    ManagedDatabaseDTORecord,
    'explorerLastAccessedAt' | 'explorerStartedAt' | 'explorerIdleTimeoutMinutes'
  >
): Date | undefined {
  const lastActivity = getExplorerLastActivityDate(db);
  if (!lastActivity) return undefined;
  return new Date(lastActivity.getTime() + getExplorerIdleTimeoutMinutes(db) * 60 * 1000);
}

export function isExplorerIdleExpired(
  db: Pick<
    ManagedDatabaseDTORecord,
    | 'explorerStatus'
    | 'explorerPort'
    | 'explorerLastAccessedAt'
    | 'explorerStartedAt'
    | 'explorerIdleTimeoutMinutes'
  >,
  now = new Date()
): boolean {
  if (db.explorerStatus !== 'running' || !db.explorerPort) return false;
  const idleExpiresAt = getExplorerIdleExpiresAt(db);
  return Boolean(idleExpiresAt && idleExpiresAt.getTime() <= now.getTime());
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
    explorer: {
      status: db.explorerStatus ?? 'stopped',
      kind: db.explorerKind ?? getExplorerKind(db.templateId),
      image: db.explorerImage,
      containerName: db.explorerContainerName,
      port: db.explorerPort,
      proxyPath:
        db.explorerStatus === 'running' || db.explorerStatus === 'starting'
          ? buildExplorerProxyPath(db._id.toString())
          : undefined,
      logs: db.explorerLogs ?? [],
      startedAt: toIsoDate(db.explorerStartedAt),
      lastAccessedAt: toIsoDate(db.explorerLastAccessedAt),
      idleTimeoutMinutes: getExplorerIdleTimeoutMinutes(db),
      idleExpiresAt: toIsoDate(getExplorerIdleExpiresAt(db)),
    },
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
  db.explorerStatus = 'stopped';
  db.explorerKind = getExplorerKind(next.templateId);
  db.explorerImage = undefined;
  db.explorerPort = undefined;
  db.explorerContainerName = undefined;
  db.explorerLogs = [];
  db.explorerStartedAt = undefined;
  db.explorerLastAccessedAt = undefined;
  db.explorerIdleTimeoutMinutes = DATABASE_EXPLORER_IDLE_TIMEOUT_MINUTES;
  await db.save();
  return mapManagedDatabaseToDTO(db);
}

async function saveOperationLog(
  db: IManagedDatabase,
  logs: string[],
  message: string,
  status?: ManagedDatabaseStatus
) {
  logs.push(timestampedLog(message));
  db.logs = logs.slice(-200);
  if (status) db.status = status;
  await db.save();
}

async function runOrThrow(
  runner: DockerRunner,
  args: string[],
  logs: string[],
  timeoutMs?: number
) {
  logs.push(timestampedLog(`$ docker ${redactDockerArgs(args).join(' ')}`));
  const result = await runner.run(args, timeoutMs);
  if (result.output) logs.push(timestampedLog(result.output));
  if (result.code !== 0) throw new Error(result.output || `docker ${args[0]} failed`);
  return result.output;
}

function getExplorerContainerName(slug: string): string {
  return `servermon-db-explorer-${sanitizeDatabaseSlug(slug)}`;
}

async function findAvailableLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!address?.port) {
          reject(new Error('Unable to allocate local explorer port'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

type ExplorerReadyFetcher = (url: string, init: RequestInit) => Promise<Response>;
type ExplorerReadySleeper = (ms: number) => Promise<void>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForExplorerHttpReady(
  port: number,
  options: {
    attempts?: number;
    intervalMs?: number;
    path?: string;
    fetcher?: ExplorerReadyFetcher;
    sleeper?: ExplorerReadySleeper;
  } = {}
): Promise<void> {
  const attempts = options.attempts ?? 45;
  const intervalMs = options.intervalMs ?? 1000;
  const fetcher = options.fetcher ?? fetch;
  const sleeper = options.sleeper ?? sleep;
  const path = options.path?.startsWith('/') ? options.path : `/${options.path ?? ''}`;
  const url = new URL(path, `http://127.0.0.1:${port}`).toString();
  let lastError = 'no response';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(url, { method: 'GET', redirect: 'manual' });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : 'fetch failed';
    }

    if (attempt < attempts - 1) {
      await sleeper(intervalMs);
    }
  }

  throw new Error(`Explorer did not become ready on ${url}: ${lastError}`);
}

interface DockerInspectNetwork {
  IPAddress?: string;
}

interface DockerInspectResult {
  NetworkSettings?: {
    Networks?: Record<string, DockerInspectNetwork>;
  };
}

function parseDockerInspect(output: string): DockerInspectResult {
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed) || typeof parsed[0] !== 'object' || parsed[0] === null) {
    throw new Error('Docker inspect returned an unexpected response');
  }
  return parsed[0] as DockerInspectResult;
}

async function resolveDatabaseContainerTarget(db: IManagedDatabase, runner: DockerRunner) {
  const containerName = db.containerName || `servermon-db-${db.slug}`;
  const result = await runner.run(['inspect', containerName]);
  if (result.code !== 0) {
    throw new Error(result.output || `Unable to inspect database container ${containerName}`);
  }
  const inspect = parseDockerInspect(result.output);
  const networks = inspect.NetworkSettings?.Networks ?? {};
  const networkEntry = Object.entries(networks).find(([, network]) => Boolean(network.IPAddress));
  if (!networkEntry) {
    throw new Error(`Unable to find a Docker network address for ${containerName}`);
  }
  const [networkName, network] = networkEntry;
  const targetHost = network.IPAddress;
  if (!targetHost) {
    throw new Error(`Unable to find a Docker network address for ${containerName}`);
  }
  return {
    targetHost,
    networkName,
  };
}

async function isContainerRunning(containerName: string, runner: DockerRunner): Promise<boolean> {
  const result = await runner.run(['inspect', '-f', '{{.State.Running}}', containerName]);
  return result.code === 0 && result.output.trim() === 'true';
}

async function saveExplorerLog(
  db: IManagedDatabase,
  logs: string[],
  message: string,
  status?: DatabaseExplorerStatus
) {
  logs.push(timestampedLog(message));
  db.explorerLogs = logs.slice(-200);
  if (status) db.explorerStatus = status;
  await db.save();
}

async function stopExplorerContainerForIdle(
  db: IManagedDatabase,
  runner: DockerRunner,
  now = new Date()
) {
  const containerName = db.explorerContainerName || getExplorerContainerName(db.slug);
  const logs = [...(db.explorerLogs ?? [])];
  await runner.run(['rm', '-f', containerName]);
  db.explorerStatus = 'stopped';
  db.explorerPort = undefined;
  db.explorerLogs = [
    ...logs,
    timestampedLog(
      `Stopped explorer container ${containerName} after ${getExplorerIdleTimeoutMinutes(
        db
      )} minutes without activity`,
      now
    ),
  ].slice(-200);
  await db.save();
}

export async function cleanupIdleManagedDatabaseExplorers(
  runner: DockerRunner = defaultDockerRunner,
  now = new Date()
): Promise<number> {
  await connectDB();
  const databases = await ManagedDatabase.find({ explorerStatus: 'running' });
  let stopped = 0;

  for (const db of databases) {
    if (isExplorerIdleExpired(db, now)) {
      await stopExplorerContainerForIdle(db, runner, now);
      stopped += 1;
    }
  }

  return stopped;
}

export async function startManagedDatabaseExplorer(
  id: string,
  runner: DockerRunner = defaultDockerRunner
): Promise<ManagedDatabaseDTO['explorer']> {
  await connectDB();
  const db = await ManagedDatabase.findById(id);
  if (!db) throw new Error('Database not found');
  if (db.status !== 'running') {
    throw new Error('Start the database before opening Explorer');
  }

  const dbId = db._id.toString();
  const existingContainerName = db.explorerContainerName || getExplorerContainerName(db.slug);
  const explorerKind = getExplorerKind(db.templateId);
  const explorerImage = getExplorerImage(db.templateId);
  const upstreamBasePath = getExplorerUpstreamBasePath(dbId, explorerKind);
  const logs = [...(db.explorerLogs ?? [])];
  if (isExplorerIdleExpired(db)) {
    await stopExplorerContainerForIdle(db, runner);
    logs.push(...(db.explorerLogs ?? []).slice(logs.length));
  }
  if (
    db.explorerStatus === 'running' &&
    db.explorerPort &&
    (await isContainerRunning(existingContainerName, runner))
  ) {
    try {
      await waitForExplorerHttpReady(db.explorerPort, { path: upstreamBasePath });
      db.explorerLastAccessedAt = new Date();
      await db.save();
      return mapManagedDatabaseToDTO(db).explorer;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Explorer readiness check failed';
      logs.push(timestampedLog(`Existing explorer was not ready; recreating it. ${message}`));
    }
  }

  db.explorerStatus = 'starting';
  db.explorerKind = explorerKind;
  db.explorerImage = explorerImage;
  db.explorerContainerName = existingContainerName;
  db.explorerLogs = [
    ...logs,
    timestampedLog(`Explorer requested for ${db.name}`),
    timestampedLog('Resolving database container network address'),
  ].slice(-200);
  await db.save();

  try {
    const nextLogs = [...db.explorerLogs];
    const target = await resolveDatabaseContainerTarget(db, runner);
    const hostPort = await findAvailableLocalPort();
    const proxyPath = buildExplorerProxyPath(dbId);
    const tlsPaths =
      db.templateId === 'mongo' && db.sslMode === 'require'
        ? buildMongoTlsPaths(getDatabaseInstanceRoot(db.dataPath))
        : undefined;
    const request = buildDatabaseExplorerRunRequest({
      id: dbId,
      slug: db.slug,
      templateId: db.templateId,
      targetHost: target.targetHost,
      targetPort: db.internalPort,
      hostPort,
      username: db.username,
      password: db.password,
      databaseName: db.databaseName,
      proxyPath,
      networkName: target.networkName,
      sslMode: db.sslMode,
      tlsPaths,
    });

    db.explorerContainerName = request.containerName;
    db.explorerPort = hostPort;
    await saveExplorerLog(
      db,
      nextLogs,
      `Removing any existing explorer container named ${request.containerName}`,
      'starting'
    );
    await runner.run(['rm', '-f', request.containerName]);
    await saveExplorerLog(db, nextLogs, `Pulling explorer image ${explorerImage}`, 'starting');
    await runOrThrow(runner, ['pull', explorerImage], nextLogs, 180_000);
    await saveExplorerLog(
      db,
      nextLogs,
      `Starting ${db.explorerKind} on local port ${hostPort}`,
      'starting'
    );
    await runOrThrow(runner, request.args, nextLogs, 60_000);
    await saveExplorerLog(
      db,
      nextLogs,
      `Waiting for ${db.explorerKind} to accept HTTP connections`,
      'starting'
    );
    await waitForExplorerHttpReady(hostPort, { path: upstreamBasePath });
    db.explorerStatus = 'running';
    db.explorerStartedAt = new Date();
    db.explorerLastAccessedAt = db.explorerStartedAt;
    db.explorerIdleTimeoutMinutes =
      db.explorerIdleTimeoutMinutes || DATABASE_EXPLORER_IDLE_TIMEOUT_MINUTES;
    db.explorerLogs = [
      ...nextLogs,
      timestampedLog(`Explorer is available through ${proxyPath}`),
    ].slice(-200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database explorer failed to start';
    logs.push(...(db.explorerLogs ?? []).slice(logs.length), timestampedLog(`ERROR: ${message}`));
    db.explorerStatus = 'failed';
    db.explorerLogs = logs.slice(-200);
  }

  await db.save();
  return mapManagedDatabaseToDTO(db).explorer;
}

export async function stopManagedDatabaseExplorer(
  id: string,
  runner: DockerRunner = defaultDockerRunner
): Promise<ManagedDatabaseDTO['explorer']> {
  await connectDB();
  const db = await ManagedDatabase.findById(id);
  if (!db) throw new Error('Database not found');
  const containerName = db.explorerContainerName || getExplorerContainerName(db.slug);
  const logs = [...(db.explorerLogs ?? [])];
  await runner.run(['rm', '-f', containerName]);
  db.explorerStatus = 'stopped';
  db.explorerPort = undefined;
  db.explorerLastAccessedAt = undefined;
  db.explorerLogs = [...logs, timestampedLog(`Stopped explorer container ${containerName}`)].slice(
    -200
  );
  await db.save();
  return mapManagedDatabaseToDTO(db).explorer;
}

export async function getManagedDatabaseExplorerTarget(
  id: string,
  runner: DockerRunner = defaultDockerRunner
): Promise<{ port: number; upstreamBasePath?: string }> {
  await connectDB();
  const db = await ManagedDatabase.findById(id);
  if (!db) throw new Error('Database not found');
  if (isExplorerIdleExpired(db)) {
    await stopExplorerContainerForIdle(db, runner);
    throw new Error(
      'Database explorer stopped after 30 minutes without activity. Reopen Explorer.'
    );
  }
  if (db.explorerStatus !== 'running' || !db.explorerPort) {
    throw new Error('Database explorer is not running');
  }
  const explorerKind = db.explorerKind ?? getExplorerKind(db.templateId);
  return {
    port: db.explorerPort,
    upstreamBasePath: getExplorerUpstreamBasePath(db._id.toString(), explorerKind),
  };
}

export async function touchManagedDatabaseExplorerActivity(id: string, now = new Date()) {
  await connectDB();
  await ManagedDatabase.updateOne(
    { _id: id, explorerStatus: 'running' },
    { $set: { explorerLastAccessedAt: now } }
  );
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
  logs.push(timestampedLog(`Deploy requested for ${db.name}`));
  db.logs = logs.slice(-200);
  await db.save();

  try {
    await saveOperationLog(db, logs, `Preparing data directory ${db.dataPath}`, 'deploying');
    await mkdir(db.dataPath, { recursive: true });
    const tlsPaths =
      db.templateId === 'mongo' && db.sslMode === 'require'
        ? buildMongoTlsPaths(getDatabaseInstanceRoot(db.dataPath))
        : undefined;
    if (tlsPaths) {
      await saveOperationLog(db, logs, 'Preparing MongoDB TLS certificate bundle', 'deploying');
      await ensureMongoTlsAssets(tlsPaths, uniqueValues([db.host, '127.0.0.1', 'localhost']));
    }
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
      sslMode: db.sslMode,
      tlsPaths,
      restartPolicy: db.restartPolicy,
      extraEnv: toObjectEnv(db.extraEnv),
    });
    db.containerName = request.containerName;
    await saveOperationLog(
      db,
      logs,
      `Removing any existing container named ${request.containerName}`,
      'deploying'
    );
    await runner.run(['rm', '-f', request.containerName]);
    await saveOperationLog(db, logs, `Pulling Docker image ${db.image}`, 'deploying');
    await runOrThrow(runner, ['pull', db.image], logs, 180_000);
    await saveOperationLog(db, logs, `Starting container ${request.containerName}`, 'deploying');
    const containerId = await runOrThrow(runner, request.args, logs, 60_000);
    db.containerName = request.containerName;
    db.containerId = containerId.trim();
    db.status = 'running';
    db.lastDeployedAt = new Date();
    db.logs = [...logs, timestampedLog(`Database is running as ${request.containerName}`)].slice(
      -200
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database deployment failed';
    logs.push(timestampedLog(`ERROR: ${message}`));
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
  if (action === 'stop') {
    await runner.run(['rm', '-f', db.explorerContainerName || getExplorerContainerName(db.slug)]);
    db.explorerStatus = 'stopped';
    db.explorerPort = undefined;
    db.explorerLastAccessedAt = undefined;
  }
  db.logs = [...logs, timestampedLog(`Action ${action} completed for ${containerName}`)].slice(
    -200
  );
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
  const explorerContainerName = db.explorerContainerName || getExplorerContainerName(db.slug);
  await runner.run(['rm', '-f', containerName]);
  await runner.run(['rm', '-f', explorerContainerName]);
  await rm(db.dataPath, { recursive: true, force: true });
  logs.push('Removed managed database container and data directory');
  await db.deleteOne();
  return { id, logs };
}
