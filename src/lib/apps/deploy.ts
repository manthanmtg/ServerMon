import { spawn } from 'node:child_process';
import {
  access,
  cp,
  lstat,
  mkdir,
  readlink,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import type { CreateManagedAppInput } from '@/modules/apps/types';
import {
  buildNginxConfig,
  buildSystemdUnit,
  createReleaseId,
  renderEnvFile,
  toSystemdServiceName,
} from './rendering';
import { getAppRoot, getReleaseRoot } from './paths';

export interface CommandRunRequest {
  command: string;
  cwd?: string;
}

export interface CommandRunResult {
  code: number;
  output: string;
}

export type CommandRunner = (request: CommandRunRequest) => Promise<CommandRunResult>;
export type HealthCheck = (
  url: string
) => Promise<{ ok: boolean; status?: number; error?: string }>;

export interface DeployNextJsAppOptions {
  app: Omit<CreateManagedAppInput, 'sourcePath'> & {
    sourcePath: string;
    slug: string;
    status?: string;
    currentReleaseId?: string;
  };
  appsRoot?: string;
  systemdDir?: string;
  nginxAvailableDir?: string;
  nginxEnabledDir?: string;
  releaseId?: string;
  runAsUser?: string;
  healthCheckAttempts?: number;
  healthCheckIntervalMs?: number;
  commandRunner?: CommandRunner;
  healthCheck?: HealthCheck;
}

export interface DeployNextJsAppResult {
  releaseId: string;
  status: 'active' | 'failed';
  logs: string[];
  error?: string;
}

const DEFAULT_SYSTEMD_DIR = '/etc/systemd/system';
const DEFAULT_NGINX_AVAILABLE_DIR = '/etc/nginx/sites-available';
const DEFAULT_NGINX_ENABLED_DIR = '/etc/nginx/sites-enabled';

const EXCLUDED_SOURCE_NAMES = new Set([
  '.git',
  '.env',
  '.env.local',
  '.env.production',
  '.next',
  'node_modules',
  'dist',
  'build',
  '.turbo',
  '.cache',
]);

export const defaultCommandRunner: CommandRunner = ({ command, cwd }) =>
  new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-lc', command], { cwd });
    const output: string[] = [];

    child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    child.on('close', (code) => resolve({ code: code ?? 1, output: output.join('') }));
    child.on('error', (error) => resolve({ code: 1, output: error.message }));
  });

export const defaultHealthCheck: HealthCheck = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    return { ok: response.ok, status: response.status };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : 'Health check failed' };
  }
};

function shouldCopySource(src: string): boolean {
  return !EXCLUDED_SOURCE_NAMES.has(path.basename(src));
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readCurrentTarget(currentPath: string): Promise<string | undefined> {
  try {
    const stat = await lstat(currentPath);
    if (!stat.isSymbolicLink()) return undefined;
    return readlink(currentPath);
  } catch {
    return undefined;
  }
}

async function replaceSymlink(linkPath: string, target: string): Promise<void> {
  const tempLink = `${linkPath}.tmp-${process.pid}-${Date.now()}`;
  await symlink(target, tempLink);
  await rm(linkPath, { recursive: true, force: true });
  await rename(tempLink, linkPath);
}

async function ensureNginxEnabled(availablePath: string, enabledPath: string): Promise<void> {
  if (await pathExists(enabledPath)) return;
  await symlink(availablePath, enabledPath);
}

async function runOrThrow(
  commandRunner: CommandRunner,
  command: string,
  logs: string[],
  cwd?: string
): Promise<void> {
  logs.push(`$ ${command}`);
  const result = await commandRunner({ command, cwd });
  if (result.output.trim()) logs.push(result.output.trim());
  if (result.code !== 0) {
    throw new Error(`Command failed: ${command}\n${result.output}`.trim());
  }
}

function buildCertbotCommand(domain: string): string {
  return [
    'certbot',
    '--nginx',
    `-d ${domain}`,
    '--non-interactive',
    '--agree-tos',
    '--redirect',
    '--register-unsafely-without-email',
  ].join(' ');
}

function healthUrl(port: number, healthCheckPath?: string): string {
  const normalizedPath = healthCheckPath?.startsWith('/') ? healthCheckPath : '/';
  return `http://127.0.0.1:${port}${normalizedPath}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealthy({
  url,
  healthCheck,
  logs,
  attempts,
  intervalMs,
}: {
  url: string;
  healthCheck: HealthCheck;
  logs: string[];
  attempts: number;
  intervalMs: number;
}): Promise<void> {
  let lastFailure = 'Health check failed';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const checked = await healthCheck(url);
    if (checked.ok) {
      logs.push('Health check passed');
      return;
    }

    lastFailure =
      checked.error || `Health check failed${checked.status ? ` with ${checked.status}` : ''}`;
    if (attempt < attempts) {
      logs.push(`Health check attempt ${attempt}/${attempts} failed: ${lastFailure}`);
      await sleep(intervalMs);
    }
  }

  throw new Error(lastFailure);
}

export async function deployNextJsApp({
  app,
  appsRoot,
  systemdDir = DEFAULT_SYSTEMD_DIR,
  nginxAvailableDir = DEFAULT_NGINX_AVAILABLE_DIR,
  nginxEnabledDir = DEFAULT_NGINX_ENABLED_DIR,
  releaseId = createReleaseId(),
  runAsUser,
  healthCheckAttempts = 12,
  healthCheckIntervalMs = 2_000,
  commandRunner = defaultCommandRunner,
  healthCheck = defaultHealthCheck,
}: DeployNextJsAppOptions): Promise<DeployNextJsAppResult> {
  const logs: string[] = [];
  const appRoot = getAppRoot(app.slug, appsRoot);
  const releaseRoot = getReleaseRoot(app.slug, releaseId, appsRoot);
  const sourceRoot = path.join(releaseRoot, 'source');
  const currentPath = path.join(appRoot, 'current');
  const serviceName = toSystemdServiceName(app.slug);
  const previousCurrentTarget = await readCurrentTarget(currentPath);
  let serviceRestarted = false;

  try {
    logs.push(`Creating release ${releaseId}`);
    await mkdir(sourceRoot, { recursive: true });
    await cp(app.sourcePath, sourceRoot, {
      recursive: true,
      filter: shouldCopySource,
    });

    await writeFile(
      path.join(releaseRoot, 'env'),
      renderEnvFile(app.envVars ?? {}, app.port),
      'utf8'
    );
    await writeFile(
      path.join(releaseRoot, 'deploy.json'),
      `${JSON.stringify(
        {
          app: app.slug,
          domain: app.domain,
          port: app.port,
          releaseId,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    await runOrThrow(commandRunner, app.commands.install, logs, sourceRoot);
    await runOrThrow(commandRunner, app.commands.build, logs, sourceRoot);

    await mkdir(systemdDir, { recursive: true });
    await mkdir(nginxAvailableDir, { recursive: true });
    await mkdir(nginxEnabledDir, { recursive: true });

    await writeFile(
      path.join(systemdDir, serviceName),
      buildSystemdUnit({
        appSlug: app.slug,
        appRoot,
        command: app.commands.start,
        runAsUser,
        port: app.port,
      }),
      'utf8'
    );

    await replaceSymlink(currentPath, releaseRoot);
    await runOrThrow(commandRunner, 'systemctl daemon-reload', logs);
    await runOrThrow(commandRunner, `systemctl enable ${serviceName}`, logs);
    await runOrThrow(commandRunner, `systemctl restart ${serviceName}`, logs);
    serviceRestarted = true;

    await waitForHealthy({
      url: healthUrl(app.port, app.healthCheckPath),
      healthCheck,
      logs,
      attempts: healthCheckAttempts,
      intervalMs: healthCheckIntervalMs,
    });

    const nginxAvailablePath = path.join(nginxAvailableDir, app.domain);
    const nginxEnabledPath = path.join(nginxEnabledDir, app.domain);
    await writeFile(
      nginxAvailablePath,
      buildNginxConfig({ domain: app.domain, port: app.port }),
      'utf8'
    );
    await ensureNginxEnabled(nginxAvailablePath, nginxEnabledPath);
    await runOrThrow(commandRunner, 'nginx -t', logs);
    await runOrThrow(commandRunner, 'nginx -s reload', logs);

    if (app.tlsEnabled) {
      await runOrThrow(commandRunner, buildCertbotCommand(app.domain), logs);
      await runOrThrow(commandRunner, 'nginx -t', logs);
      await runOrThrow(commandRunner, 'nginx -s reload', logs);
    }

    return { releaseId, status: 'active', logs };
  } catch (error: unknown) {
    if (previousCurrentTarget) {
      await replaceSymlink(currentPath, previousCurrentTarget);
      if (serviceRestarted) {
        const rollbackRestart = await commandRunner({
          command: `systemctl restart ${serviceName}`,
        });
        logs.push(`$ systemctl restart ${serviceName}`);
        if (rollbackRestart.output.trim()) logs.push(rollbackRestart.output.trim());
      }
    } else {
      await unlink(currentPath).catch(() => undefined);
    }

    const message = error instanceof Error ? error.message : 'Deployment failed';
    logs.push(`ERROR: ${message}`);
    return { releaseId, status: 'failed', logs, error: message };
  }
}
