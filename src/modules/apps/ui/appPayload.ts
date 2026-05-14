import type { ManagedAppDTO } from '../types';

const appStatuses = new Set<ManagedAppDTO['status']>([
  'draft',
  'deploying',
  'running',
  'failed',
  'stopped',
  'unknown',
]);

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
  };
}

export function readManagedAppsList(payload: unknown): ManagedAppDTO[] {
  if (!isRecord(payload)) return [];

  return Array.isArray(payload.apps)
    ? payload.apps.flatMap((app) => readManagedApp(app) ?? [])
    : [];
}
