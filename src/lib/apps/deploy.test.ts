/** @vitest-environment node */
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deployNextJsApp } from './deploy';

const tempDirs: string[] = [];

async function createSourceRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'servermon-app-source-'));
  tempDirs.push(dir);
  await writeFile(path.join(dir, 'package.json'), '{"scripts":{"build":"next build"}}', 'utf8');
  await writeFile(path.join(dir, '.env'), 'SHOULD_NOT_COPY=1', 'utf8');
  await writeFile(
    path.join(dir, 'page.tsx'),
    'export default function Page() { return null; }',
    'utf8'
  );
  return dir;
}

async function createDeployDirs() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'servermon-apps-'));
  tempDirs.push(root);
  const systemdDir = path.join(root, 'systemd');
  const nginxAvailableDir = path.join(root, 'nginx-available');
  const nginxEnabledDir = path.join(root, 'nginx-enabled');
  return { root, systemdDir, nginxAvailableDir, nginxEnabledDir };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('deployNextJsApp', () => {
  it('builds a managed release and runs deployment commands in order', async () => {
    const sourcePath = await createSourceRepo();
    const dirs = await createDeployDirs();
    const commands: string[] = [];

    const result = await deployNextJsApp({
      app: {
        name: 'LifeOS',
        slug: 'lifeos',
        templateId: 'nextjs',
        sourcePath,
        domain: 'life.manthanby.cv',
        port: 3010,
        commands: {
          install: 'pnpm install --frozen-lockfile',
          build: 'pnpm build',
          start: 'pnpm start',
        },
        envVars: { NEXT_PUBLIC_APP_URL: 'https://life.manthanby.cv' },
        healthCheckPath: '/',
        status: 'draft',
      },
      appsRoot: dirs.root,
      systemdDir: dirs.systemdDir,
      nginxAvailableDir: dirs.nginxAvailableDir,
      nginxEnabledDir: dirs.nginxEnabledDir,
      releaseId: '20260506-123456-789',
      runAsUser: 'servermon',
      commandRunner: async ({ command }) => {
        commands.push(command);
        return { code: 0, output: `${command} ok` };
      },
      healthCheck: async (url) => ({ ok: url === 'http://127.0.0.1:3010/' }),
    });

    expect(result.status).toBe('active');
    expect(commands).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm build',
      'systemctl daemon-reload',
      'systemctl enable servermon-app-lifeos.service',
      'systemctl restart servermon-app-lifeos.service',
      'nginx -t',
      'nginx -s reload',
    ]);
    await expect(readFile(path.join(dirs.root, 'lifeos', 'current', 'env'), 'utf8')).resolves.toBe(
      "NEXT_PUBLIC_APP_URL='https://life.manthanby.cv'\nPORT='3010'\n"
    );
    await expect(
      readFile(
        path.join(dirs.root, 'lifeos', 'releases', result.releaseId, 'source', '.env'),
        'utf8'
      )
    ).rejects.toThrow();
    await expect(
      readFile(path.join(dirs.systemdDir, 'servermon-app-lifeos.service'), 'utf8')
    ).resolves.toContain('WorkingDirectory=' + path.join(dirs.root, 'lifeos', 'current', 'source'));
    await expect(readlink(path.join(dirs.nginxEnabledDir, 'life.manthanby.cv'))).resolves.toBe(
      path.join(dirs.nginxAvailableDir, 'life.manthanby.cv')
    );
  });

  it('does not change current release when build fails before cutover', async () => {
    const sourcePath = await createSourceRepo();
    const dirs = await createDeployDirs();
    const previousRelease = path.join(dirs.root, 'lifeos', 'releases', 'old-release');
    await mkdir(path.join(previousRelease, 'source'), { recursive: true });
    await writeFile(path.join(previousRelease, 'source', 'keep.txt'), 'old', 'utf8');
    await rm(path.join(dirs.root, 'lifeos', 'current'), { recursive: true, force: true });
    await symlink(previousRelease, path.join(dirs.root, 'lifeos', 'current'));

    const commands: string[] = [];
    const result = await deployNextJsApp({
      app: {
        name: 'LifeOS',
        slug: 'lifeos',
        templateId: 'nextjs',
        sourcePath,
        domain: 'life.manthanby.cv',
        port: 3010,
        commands: {
          install: 'pnpm install',
          build: 'pnpm build',
          start: 'pnpm start',
        },
        envVars: {},
        healthCheckPath: '/',
        status: 'running',
        currentReleaseId: 'old-release',
      },
      appsRoot: dirs.root,
      systemdDir: dirs.systemdDir,
      nginxAvailableDir: dirs.nginxAvailableDir,
      nginxEnabledDir: dirs.nginxEnabledDir,
      releaseId: 'failed-release',
      commandRunner: async ({ command }) => {
        commands.push(command);
        return command === 'pnpm build'
          ? { code: 1, output: 'build failed' }
          : { code: 0, output: 'ok' };
      },
      healthCheck: async () => ({ ok: true }),
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Command failed: pnpm build');
    expect(commands).toEqual(['pnpm install', 'pnpm build']);
    await expect(readlink(path.join(dirs.root, 'lifeos', 'current'))).resolves.toBe(
      previousRelease
    );
  });

  it('rolls current back and restarts the previous service when health check fails after cutover', async () => {
    const sourcePath = await createSourceRepo();
    const dirs = await createDeployDirs();
    const previousRelease = path.join(dirs.root, 'lifeos', 'releases', 'old-release');
    await mkdir(path.join(previousRelease, 'source'), { recursive: true });
    await writeFile(path.join(previousRelease, 'source', 'keep.txt'), 'old', 'utf8');
    await symlink(previousRelease, path.join(dirs.root, 'lifeos', 'current'));

    const commands: string[] = [];
    const result = await deployNextJsApp({
      app: {
        name: 'LifeOS',
        slug: 'lifeos',
        templateId: 'nextjs',
        sourcePath,
        domain: 'life.manthanby.cv',
        port: 3010,
        commands: {
          install: 'pnpm install',
          build: 'pnpm build',
          start: 'pnpm start',
        },
        envVars: {},
        healthCheckPath: '/',
        status: 'running',
        currentReleaseId: 'old-release',
      },
      appsRoot: dirs.root,
      systemdDir: dirs.systemdDir,
      nginxAvailableDir: dirs.nginxAvailableDir,
      nginxEnabledDir: dirs.nginxEnabledDir,
      releaseId: 'bad-health-release',
      commandRunner: async ({ command }) => {
        commands.push(command);
        return { code: 0, output: 'ok' };
      },
      healthCheck: async () => ({ ok: false, status: 500 }),
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Health check failed with 500');
    expect(commands).toEqual([
      'pnpm install',
      'pnpm build',
      'systemctl daemon-reload',
      'systemctl enable servermon-app-lifeos.service',
      'systemctl restart servermon-app-lifeos.service',
      'systemctl restart servermon-app-lifeos.service',
    ]);
    await expect(readlink(path.join(dirs.root, 'lifeos', 'current'))).resolves.toBe(
      previousRelease
    );
  });
});
