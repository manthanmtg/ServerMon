/** @vitest-environment node */
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultCommandRunner, deployNextJsApp } from './deploy';

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
  it('does not leak ServerMon Next.js runtime flags into app build commands', async () => {
    const previousTurbopack = process.env.TURBOPACK;
    const previousNextPrivateTurbopack = process.env.NEXT_PRIVATE_TURBOPACK;
    process.env.TURBOPACK = '1';
    process.env.NEXT_PRIVATE_TURBOPACK = '1';

    try {
      const result = await defaultCommandRunner({
        command:
          'node -e "process.stdout.write(JSON.stringify({ turbopack: process.env.TURBOPACK, nextPrivateTurbopack: process.env.NEXT_PRIVATE_TURBOPACK }))"',
      });

      expect(result.code).toBe(0);
      expect(JSON.parse(result.output)).toEqual({});
    } finally {
      if (previousTurbopack === undefined) delete process.env.TURBOPACK;
      else process.env.TURBOPACK = previousTurbopack;
      if (previousNextPrivateTurbopack === undefined) delete process.env.NEXT_PRIVATE_TURBOPACK;
      else process.env.NEXT_PRIVATE_TURBOPACK = previousNextPrivateTurbopack;
    }
  });

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
        domain: 'app.example.com',
        port: 3010,
        commands: {
          install: 'pnpm install --frozen-lockfile',
          build: 'pnpm build',
          start: 'pnpm start',
        },
        envVars: { NEXT_PUBLIC_APP_URL: 'https://app.example.com' },
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
      "NEXT_PUBLIC_APP_URL='https://app.example.com'\nPORT='3010'\n"
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
    await expect(readlink(path.join(dirs.nginxEnabledDir, 'app.example.com'))).resolves.toBe(
      path.join(dirs.nginxAvailableDir, 'app.example.com')
    );
  });

  it('requests and enables a certbot certificate when TLS is enabled', async () => {
    const sourcePath = await createSourceRepo();
    const dirs = await createDeployDirs();
    const commands: string[] = [];

    const result = await deployNextJsApp({
      app: {
        name: 'LifeOS',
        slug: 'lifeos',
        templateId: 'nextjs',
        sourcePath,
        domain: 'app.example.com',
        port: 3010,
        commands: {
          install: 'pnpm install',
          build: 'pnpm build',
          start: 'pnpm start',
        },
        envVars: {},
        healthCheckPath: '/',
        tlsEnabled: true,
        status: 'draft',
      },
      appsRoot: dirs.root,
      systemdDir: dirs.systemdDir,
      nginxAvailableDir: dirs.nginxAvailableDir,
      nginxEnabledDir: dirs.nginxEnabledDir,
      releaseId: 'tls-release',
      commandRunner: async ({ command }) => {
        commands.push(command);
        return { code: 0, output: `${command} ok` };
      },
      healthCheck: async () => ({ ok: true }),
    });

    expect(result.status).toBe('active');
    expect(commands).toEqual([
      'pnpm install',
      'pnpm build',
      'systemctl daemon-reload',
      'systemctl enable servermon-app-lifeos.service',
      'systemctl restart servermon-app-lifeos.service',
      'nginx -t',
      'nginx -s reload',
      'certbot --nginx -d app.example.com --non-interactive --agree-tos --redirect --register-unsafely-without-email',
      'nginx -t',
      'nginx -s reload',
    ]);
  });

  it('skips certbot issuance when a TLS certificate already exists', async () => {
    const sourcePath = await createSourceRepo();
    const dirs = await createDeployDirs();
    const letsencryptLiveDir = path.join(dirs.root, 'letsencrypt-live');
    const certificateDir = path.join(letsencryptLiveDir, 'app.example.com');
    await mkdir(certificateDir, { recursive: true });
    await writeFile(path.join(certificateDir, 'fullchain.pem'), 'certificate', 'utf8');
    await writeFile(path.join(certificateDir, 'privkey.pem'), 'private key', 'utf8');
    const commands: string[] = [];

    const result = await deployNextJsApp({
      app: {
        name: 'LifeOS',
        slug: 'lifeos',
        templateId: 'nextjs',
        sourcePath,
        domain: 'app.example.com',
        port: 3010,
        commands: {
          install: 'pnpm install',
          build: 'pnpm build',
          start: 'pnpm start',
        },
        envVars: {},
        healthCheckPath: '/',
        tlsEnabled: true,
        status: 'active',
      },
      appsRoot: dirs.root,
      systemdDir: dirs.systemdDir,
      nginxAvailableDir: dirs.nginxAvailableDir,
      nginxEnabledDir: dirs.nginxEnabledDir,
      letsencryptLiveDir,
      releaseId: 'tls-existing-release',
      commandRunner: async ({ command }) => {
        commands.push(command);
        return { code: 0, output: `${command} ok` };
      },
      healthCheck: async () => ({ ok: true }),
    });

    expect(result.status).toBe('active');
    expect(commands).toEqual([
      'pnpm install',
      'pnpm build',
      'systemctl daemon-reload',
      'systemctl enable servermon-app-lifeos.service',
      'systemctl restart servermon-app-lifeos.service',
      'nginx -t',
      'nginx -s reload',
    ]);
    expect(result.logs).toContain(
      'Existing TLS certificate found for app.example.com; skipping certbot'
    );
    await expect(
      readFile(path.join(dirs.nginxAvailableDir, 'app.example.com'), 'utf8')
    ).resolves.toContain(`ssl_certificate ${path.join(certificateDir, 'fullchain.pem')};`);
    await expect(
      readFile(path.join(dirs.nginxAvailableDir, 'app.example.com'), 'utf8')
    ).resolves.toContain(`ssl_certificate_key ${path.join(certificateDir, 'privkey.pem')};`);
  });

  it('retries certbot issuance when another certbot instance is running', async () => {
    const sourcePath = await createSourceRepo();
    const dirs = await createDeployDirs();
    const letsencryptLiveDir = path.join(dirs.root, 'letsencrypt-live');
    const commands: string[] = [];
    let certbotAttempts = 0;

    const result = await deployNextJsApp({
      app: {
        name: 'LifeOS',
        slug: 'lifeos',
        templateId: 'nextjs',
        sourcePath,
        domain: 'app.example.com',
        port: 3010,
        commands: {
          install: 'pnpm install',
          build: 'pnpm build',
          start: 'pnpm start',
        },
        envVars: {},
        healthCheckPath: '/',
        tlsEnabled: true,
        status: 'draft',
      },
      appsRoot: dirs.root,
      systemdDir: dirs.systemdDir,
      nginxAvailableDir: dirs.nginxAvailableDir,
      nginxEnabledDir: dirs.nginxEnabledDir,
      letsencryptLiveDir,
      certbotRetryIntervalMs: 1,
      releaseId: 'tls-retry-release',
      commandRunner: async ({ command }) => {
        commands.push(command);
        if (command.startsWith('certbot ')) {
          certbotAttempts += 1;
          if (certbotAttempts === 1) {
            return { code: 1, output: 'Another instance of Certbot is already running.' };
          }
        }
        return { code: 0, output: `${command} ok` };
      },
      healthCheck: async () => ({ ok: true }),
    });

    expect(result.status).toBe('active');
    expect(commands.filter((command) => command.startsWith('certbot '))).toEqual([
      'certbot --nginx -d app.example.com --non-interactive --agree-tos --redirect --register-unsafely-without-email',
      'certbot --nginx -d app.example.com --non-interactive --agree-tos --redirect --register-unsafely-without-email',
    ]);
    expect(result.logs).toContain('Certbot is already running; retrying in 1ms (attempt 2/3)');
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
        domain: 'app.example.com',
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
        domain: 'app.example.com',
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
      healthCheckAttempts: 1,
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

  it('waits for a restarted app to become healthy before failing the release', async () => {
    const sourcePath = await createSourceRepo();
    const dirs = await createDeployDirs();
    let healthChecks = 0;

    const result = await deployNextJsApp({
      app: {
        name: 'LifeOS',
        slug: 'lifeos',
        templateId: 'nextjs',
        sourcePath,
        domain: 'app.example.com',
        port: 3010,
        commands: {
          install: 'pnpm install',
          build: 'pnpm build',
          start: 'pnpm start',
        },
        envVars: {},
        healthCheckPath: '/',
        status: 'draft',
      },
      appsRoot: dirs.root,
      systemdDir: dirs.systemdDir,
      nginxAvailableDir: dirs.nginxAvailableDir,
      nginxEnabledDir: dirs.nginxEnabledDir,
      releaseId: 'slow-start-release',
      commandRunner: async () => ({ code: 0, output: 'ok' }),
      healthCheckIntervalMs: 0,
      healthCheck: async () => {
        healthChecks += 1;
        return { ok: healthChecks >= 3, error: 'fetch failed' };
      },
    });

    expect(result.status).toBe('active');
    expect(healthChecks).toBe(3);
    expect(result.logs).toContain('Health check passed');
    await expect(readlink(path.join(dirs.root, 'lifeos', 'current'))).resolves.toBe(
      path.join(dirs.root, 'lifeos', 'releases', 'slow-start-release')
    );
  });
});
