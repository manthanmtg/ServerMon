import type { ManagedAppDTO } from '../types';

const appStatuses = new Set<ManagedAppDTO['status']>([
  'draft',
  'deploying',
  'running',
  'failed',
  'stopped',
  'unknown',
]);
const operationTypes = new Set(['deploy', 'update', 'rollback', 'delete']);
const operationStatuses = new Set(['running', 'succeeded', 'failed', 'unchanged']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRequiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readStatus(value: unknown): ManagedAppDTO['status'] {
  return typeof value === 'string' && appStatuses.has(value as ManagedAppDTO['status'])
    ? (value as ManagedAppDTO['status'])
    : 'unknown';
}

function readEnvVars(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

function readOperations(value: unknown): ManagedAppDTO['operations'] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = readRequiredString(item.id);
    const title = readRequiredString(item.title);
    const step = readRequiredString(item.step);
    const startedAt = readRequiredString(item.startedAt);
    if (!id || !title || !step || !startedAt) return [];
    const type = typeof item.type === 'string' && operationTypes.has(item.type) ? item.type : null;
    const status =
      typeof item.status === 'string' && operationStatuses.has(item.status) ? item.status : null;
    if (!type || !status) return [];

    return [
      {
        id,
        type: type as ManagedAppDTO['operations'][number]['type'],
        status: status as ManagedAppDTO['operations'][number]['status'],
        title,
        step,
        startedAt,
        completedAt: typeof item.completedAt === 'string' ? item.completedAt : undefined,
        releaseId: typeof item.releaseId === 'string' ? item.releaseId : undefined,
        commitSha: typeof item.commitSha === 'string' ? item.commitSha : undefined,
        error: typeof item.error === 'string' ? item.error : undefined,
        logs: Array.isArray(item.logs)
          ? item.logs.filter((line): line is string => typeof line === 'string')
          : [],
      },
    ];
  });
}

function readRuntime(value: unknown): ManagedAppDTO['runtime'] {
  if (!isRecord(value)) return undefined;
  const serviceName = readRequiredString(value.serviceName);
  const checkedAt = readRequiredString(value.checkedAt);
  if (!serviceName || !checkedAt) return undefined;

  return {
    available: value.available === true,
    serviceName,
    activeState: typeof value.activeState === 'string' ? value.activeState : undefined,
    subState: typeof value.subState === 'string' ? value.subState : undefined,
    mainPid: typeof value.mainPid === 'number' ? value.mainPid : undefined,
    cpuPercent: typeof value.cpuPercent === 'number' ? value.cpuPercent : undefined,
    memoryBytes: typeof value.memoryBytes === 'number' ? value.memoryBytes : undefined,
    memoryPercent: typeof value.memoryPercent === 'number' ? value.memoryPercent : undefined,
    uptimeSeconds: typeof value.uptimeSeconds === 'number' ? value.uptimeSeconds : undefined,
    restartCount: typeof value.restartCount === 'number' ? value.restartCount : undefined,
    checkedAt,
    error: typeof value.error === 'string' ? value.error : undefined,
  };
}

function readManagedApp(value: unknown): ManagedAppDTO | null {
  if (!isRecord(value)) return null;

  const id = readRequiredString(value.id);
  const name = readRequiredString(value.name);
  const domain = readRequiredString(value.domain);

  if (!id || !name || !domain) return null;

  const app = value as Partial<ManagedAppDTO>;

  return {
    ...app,
    id,
    name,
    slug: typeof app.slug === 'string' && app.slug ? app.slug : id,
    templateId: app.templateId ?? 'nextjs',
    sourceType: app.sourceType === 'git' ? 'git' : 'local',
    domain,
    port: typeof app.port === 'number' && Number.isFinite(app.port) ? app.port : 0,
    commands: app.commands ?? { install: '', build: '', start: '' },
    envVars: readEnvVars(app.envVars),
    healthCheckPath: app.healthCheckPath ?? '/',
    tlsEnabled: app.tlsEnabled === true,
    status: readStatus(app.status),
    releases: Array.isArray(app.releases) ? app.releases : [],
    operations: readOperations(app.operations),
    runtime: readRuntime(app.runtime),
  };
}

export function readManagedAppsList(payload: unknown): ManagedAppDTO[] {
  if (!isRecord(payload)) return [];

  return Array.isArray(payload.apps)
    ? payload.apps.flatMap((app) => readManagedApp(app) ?? [])
    : [];
}
