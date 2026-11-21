import crypto from 'node:crypto';
import { readFile as realReadFile } from 'node:fs/promises';
import { z } from 'zod';
import { ACCESS_MODES } from './enums';
import type { ManagedDatabaseDTO } from '@/modules/databases/types';

const SERVERMON_ENV_PATH = '/etc/servermon/env';
const BRIDGE_TOKEN_CONTEXT = 'servermon-agent-bridge:v1';

const BridgeTargetZ = z.object({
  localIp: z.string().min(1),
  localPort: z.number().int().min(1).max(65535),
  protocol: z.enum(['http', 'https', 'tcp']),
});

const BridgeRouteDefaultsZ = z.object({
  eligible: z.boolean(),
  templateSlug: z.string().optional(),
  proxyRuleName: z.string().min(1),
  accessMode: z.enum(ACCESS_MODES),
  tlsEnabled: z.boolean(),
  websocketEnabled: z.boolean(),
  compression: z.boolean(),
  timeoutSeconds: z.number().int().min(1).max(3600),
  maxBodyMb: z.number().int().min(1).max(1024),
});

const BridgeDatabaseMetadataZ = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  engine: z.enum(['mongo', 'postgres', 'mysql']),
  version: z.string().min(1),
  image: z.string().optional(),
  databaseName: z.string().optional(),
  dataPath: z.string().optional(),
  sslMode: z.enum(['disable', 'prefer', 'require']).optional(),
});

export const ServerMonBridgeRouteCandidateZodSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['servermon', 'database', 'app', 'service']),
  module: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['running', 'stopped', 'failed', 'unknown']),
  target: BridgeTargetZ,
  route: BridgeRouteDefaultsZ,
  metadata: z
    .object({
      database: BridgeDatabaseMetadataZ.optional(),
    })
    .optional(),
  securityNotes: z.array(z.string()).default([]),
});

export const ServerMonBridgeSnapshotZodSchema = z.object({
  schemaVersion: z.literal(1),
  collectedAt: z.string(),
  app: z.object({
    running: z.boolean(),
    port: z.number().int().min(1).max(65535),
    version: z.string().optional(),
  }),
  modules: z.object({
    databases: z.object({
      running: z.boolean(),
      total: z.number().int().min(0),
      runningCount: z.number().int().min(0),
    }),
  }),
  routeCandidates: z.array(ServerMonBridgeRouteCandidateZodSchema).max(100),
  lastError: z.string().optional(),
});

export type ServerMonBridgeRouteCandidate = z.infer<typeof ServerMonBridgeRouteCandidateZodSchema>;
export type ServerMonBridgeSnapshot = z.infer<typeof ServerMonBridgeSnapshotZodSchema>;

export interface BuildServerMonBridgeSnapshotInput {
  app: {
    port: number;
    version?: string;
  };
  databases: ManagedDatabaseDTO[];
  now?: () => Date;
}

type EnvLike = Record<string, string | undefined>;

function parseBridgeEnvLines(raw: string | undefined): EnvLike {
  const out: EnvLike = {};
  if (!raw) return out;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;
    const index = normalized.indexOf('=');
    if (index <= 0) continue;
    const key = normalized.slice(0, index).trim();
    let value = normalized.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function deriveServerMonBridgeToken(secret: string): string {
  return crypto.createHmac('sha256', secret).update(BRIDGE_TOKEN_CONTEXT).digest('hex');
}

function resolveServerMonBridgeTokenFromEnv(env: EnvLike = process.env): string | undefined {
  const explicit = env.SERVERMON_AGENT_BRIDGE_TOKEN?.trim();
  if (explicit) return explicit;

  const jwtSecret = env.JWT_SECRET?.trim();
  if (!jwtSecret) return undefined;
  return deriveServerMonBridgeToken(jwtSecret);
}

export async function resolveServerMonBridgeToken(
  input: {
    env?: EnvLike;
    readFile?: (path: string, encoding: 'utf8') => Promise<string>;
  } = {}
): Promise<string | undefined> {
  const fromEnv = resolveServerMonBridgeTokenFromEnv(input.env ?? process.env);
  if (fromEnv) return fromEnv;

  const readFile = input.readFile ?? realReadFile;
  try {
    return resolveServerMonBridgeTokenFromEnv(
      parseBridgeEnvLines(await readFile(SERVERMON_ENV_PATH, 'utf8'))
    );
  } catch {
    return undefined;
  }
}

export function serverMonBridgeTokenMatches(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function dbEngineLabel(engine: ManagedDatabaseDTO['templateId']): string {
  if (engine === 'mongo') return 'MongoDB';
  if (engine === 'postgres') return 'PostgreSQL';
  return 'MySQL';
}

function databaseProxyRuleName(db: Pick<ManagedDatabaseDTO, 'slug'>): string {
  return db.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'database';
}

function buildServerMonCandidate(port: number): ServerMonBridgeRouteCandidate {
  return {
    id: 'servermon:app',
    kind: 'servermon',
    module: 'servermon',
    name: 'ServerMon app',
    status: 'running',
    target: { localIp: '127.0.0.1', localPort: port, protocol: 'http' },
    route: {
      eligible: true,
      templateSlug: 'servermon',
      proxyRuleName: 'servermon',
      accessMode: 'servermon_auth',
      tlsEnabled: true,
      websocketEnabled: true,
      compression: true,
      timeoutSeconds: 300,
      maxBodyMb: 64,
    },
    securityNotes: ['Expose this only when you want to manage this ServerMon app from the Hub.'],
  };
}

function buildDatabaseCandidate(db: ManagedDatabaseDTO): ServerMonBridgeRouteCandidate {
  const engine = dbEngineLabel(db.templateId);
  return {
    id: `database:${db.id}`,
    kind: 'database',
    module: 'databases',
    name: db.name,
    status: db.status === 'running' ? 'running' : db.status === 'failed' ? 'failed' : 'stopped',
    target: {
      localIp: '127.0.0.1',
      localPort: db.port,
      protocol: 'tcp',
    },
    route: {
      eligible: db.status === 'running',
      templateSlug: 'generic-tcp',
      proxyRuleName: databaseProxyRuleName(db),
      accessMode: 'public',
      tlsEnabled: false,
      websocketEnabled: false,
      compression: false,
      timeoutSeconds: 60,
      maxBodyMb: 32,
    },
    metadata: {
      database: {
        id: db.id,
        slug: db.slug,
        engine: db.templateId,
        version: db.version,
        image: db.image,
        databaseName: db.databaseName,
        dataPath: db.dataPath,
        sslMode: db.sslMode,
      },
    },
    securityNotes: [
      `${engine} is reachable on the local database TCP port ${db.port}.`,
      'Expose only when remote database access is intended, and prefer DB-native auth, firewall rules, or private networks.',
    ],
  };
}

export function buildServerMonBridgeSnapshot(
  input: BuildServerMonBridgeSnapshotInput
): ServerMonBridgeSnapshot {
  const runningDatabases = input.databases.filter((db) => db.status === 'running');
  const routeCandidates: ServerMonBridgeRouteCandidate[] = [
    buildServerMonCandidate(input.app.port),
    ...runningDatabases.map((db) => buildDatabaseCandidate(db)),
  ];

  return ServerMonBridgeSnapshotZodSchema.parse({
    schemaVersion: 1,
    collectedAt: (input.now ?? (() => new Date()))().toISOString(),
    app: {
      running: true,
      port: input.app.port,
      ...(input.app.version ? { version: input.app.version } : {}),
    },
    modules: {
      databases: {
        running: runningDatabases.length > 0,
        total: input.databases.length,
        runningCount: runningDatabases.length,
      },
    },
    routeCandidates,
  });
}

export async function collectServerMonBridgeCapabilities(input: {
  port: number;
  fetchImpl?: typeof fetch;
  readFile?: (path: string, encoding: 'utf8') => Promise<string>;
  timeoutMs?: number;
}): Promise<ServerMonBridgeSnapshot | undefined> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return undefined;

  const url = `http://127.0.0.1:${input.port}/api/fleet/public/servermon-bridge`;
  const timeoutMs = Math.max(1, input.timeoutMs ?? 5000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const bridgeToken = await resolveServerMonBridgeToken({ readFile: input.readFile });
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        'x-servermon-agent': 'servermon-agent',
        ...(bridgeToken ? { 'x-servermon-agent-bridge-token': bridgeToken } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const parsed = ServerMonBridgeSnapshotZodSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
