/** @vitest-environment node */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CreateManagedDatabaseSchema,
  DATABASE_EXPLORER_IDLE_TIMEOUT_MINUTES,
  buildDatabaseExplorerRunRequest,
  buildDockerRunRequest,
  buildMongoTlsPaths,
  ensureMongoTlsAssets,
  getExplorerIdleExpiresAt,
  isExplorerIdleExpired,
  mapManagedDatabaseToDTO,
  normalizeCreateManagedDatabaseInput,
  waitForExplorerHttpReady,
} from './service';

describe('database service helpers', () => {
  it('normalizes create input with safe defaults and host-owned data', () => {
    const parsed = CreateManagedDatabaseSchema.parse({
      name: 'Mongo 1 Monho',
      templateId: 'mongo',
      version: '8',
      port: 27018,
      username: 'root',
      password: 'super-secret',
      databaseName: 'appdb',
      publicRoute: false,
      sslMode: 'disable',
    });

    expect(normalizeCreateManagedDatabaseInput(parsed, '/srv/servermon_databases')).toMatchObject({
      name: 'Mongo 1 Monho',
      slug: 'mongo-1-monho',
      templateId: 'mongo',
      version: '8',
      image: 'mongo:8',
      host: '127.0.0.1',
      port: 27018,
      internalPort: 27017,
      username: 'root',
      password: 'super-secret',
      databaseName: 'appdb',
      dataPath: '/srv/servermon_databases/mongo-1-monho/data',
      publicRoute: false,
      bindAddress: '127.0.0.1',
      sslMode: 'disable',
      status: 'draft',
      logs: [],
      explorerIdleTimeoutMinutes: DATABASE_EXPLORER_IDLE_TIMEOUT_MINUTES,
    });
  });

  it('builds local-only Docker run requests for Postgres by default', () => {
    const request = buildDockerRunRequest({
      slug: 'reporting-db',
      templateId: 'postgres',
      version: '17',
      image: 'postgres:17',
      port: 55432,
      internalPort: 5432,
      username: 'reporting',
      password: 'pg-pass',
      databaseName: 'reports',
      dataPath: '/var/lib/servermon/databases/reporting-db/data',
      bindAddress: '127.0.0.1',
      restartPolicy: 'unless-stopped',
      extraEnv: { TZ: 'UTC' },
    });

    expect(request.containerName).toBe('servermon-db-reporting-db');
    expect(request.args).toEqual([
      'run',
      '-d',
      '--name',
      'servermon-db-reporting-db',
      '--restart',
      'unless-stopped',
      '-p',
      '127.0.0.1:55432:5432',
      '-v',
      '/var/lib/servermon/databases/reporting-db/data:/var/lib/postgresql/data',
      '-e',
      'POSTGRES_USER=reporting',
      '-e',
      'POSTGRES_PASSWORD=pg-pass',
      '-e',
      'POSTGRES_DB=reports',
      '-e',
      'TZ=UTC',
      'postgres:17',
    ]);
  });

  it('builds public Docker run requests by binding to all interfaces', () => {
    const request = buildDockerRunRequest({
      slug: 'customer-mysql',
      templateId: 'mysql',
      version: '8',
      image: 'mysql:8',
      port: 3307,
      internalPort: 3306,
      username: 'app',
      password: 'mysql-pass',
      databaseName: 'customers',
      dataPath: '/var/lib/servermon/databases/customer-mysql/data',
      bindAddress: '0.0.0.0',
      restartPolicy: 'unless-stopped',
      extraEnv: {},
    });

    expect(request.args).toContain('0.0.0.0:3307:3306');
    expect(request.args).toContain(
      '/var/lib/servermon/databases/customer-mysql/data:/var/lib/mysql'
    );
    expect(request.args).toContain('MYSQL_USER=app');
    expect(request.args).toContain('MYSQL_PASSWORD=mysql-pass');
    expect(request.args).toContain('MYSQL_ROOT_PASSWORD=mysql-pass');
  });

  it('builds Mongo Docker run requests with server TLS when SSL is required', () => {
    const tlsPaths = buildMongoTlsPaths('/var/lib/servermon/databases/main-mongo');
    const request = buildDockerRunRequest({
      slug: 'main-mongo',
      templateId: 'mongo',
      version: '8',
      image: 'mongo:8',
      port: 27017,
      internalPort: 27017,
      username: 'root',
      password: 'mongo-pass',
      databaseName: 'appdb',
      dataPath: '/var/lib/servermon/databases/main-mongo/data',
      bindAddress: '127.0.0.1',
      restartPolicy: 'unless-stopped',
      sslMode: 'require',
      tlsPaths,
      extraEnv: {},
    });

    expect(request.args).toEqual([
      'run',
      '-d',
      '--name',
      'servermon-db-main-mongo',
      '--restart',
      'unless-stopped',
      '-p',
      '127.0.0.1:27017:27017',
      '-v',
      '/var/lib/servermon/databases/main-mongo/data:/data/db',
      '-v',
      '/var/lib/servermon/databases/main-mongo/tls:/etc/servermon-db-tls:ro',
      '-e',
      'MONGO_INITDB_ROOT_USERNAME=root',
      '-e',
      'MONGO_INITDB_ROOT_PASSWORD=mongo-pass',
      '-e',
      'MONGO_INITDB_DATABASE=appdb',
      'mongo:8',
      'mongod',
      '--auth',
      '--bind_ip_all',
      '--tlsMode',
      'requireTLS',
      '--tlsCertificateKeyFile',
      '/etc/servermon-db-tls/server.pem',
      '--tlsCAFile',
      '/etc/servermon-db-tls/ca.crt',
    ]);
  });

  it('automates Mongo TLS certificate asset generation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'servermon-mongo-tls-'));
    const tlsPaths = buildMongoTlsPaths(root);
    await mkdir(tlsPaths.dir, { recursive: true });
    const commands: Array<{ file: string; args: string[] }> = [];
    const runner = vi.fn(async (file: string, args: string[]) => {
      commands.push({ file, args });
      const outputIndex = args.indexOf('-out');
      if (outputIndex >= 0 && args[outputIndex + 1]) {
        await writeFile(args[outputIndex + 1], 'generated');
      }
      const keyOutputIndex = args.indexOf('-keyout');
      if (keyOutputIndex >= 0 && args[keyOutputIndex + 1]) {
        await writeFile(args[keyOutputIndex + 1], 'generated-key');
      }
      return { stdout: '', stderr: '' };
    });

    try {
      await ensureMongoTlsAssets(tlsPaths, ['127.0.0.1', 'localhost'], runner);
    } finally {
      await rm(root, { recursive: true, force: true });
    }

    expect(runner).toHaveBeenCalledTimes(4);
    expect(commands[0]).toMatchObject({
      file: 'openssl',
      args: expect.arrayContaining(['genrsa', '-out', tlsPaths.caKeyPath, '4096']),
    });
    expect(commands[3]).toMatchObject({
      file: 'openssl',
      args: expect.arrayContaining([
        'x509',
        '-req',
        '-in',
        tlsPaths.serverCsrPath,
        '-CA',
        tlsPaths.caCertPath,
        '-CAkey',
        tlsPaths.caKeyPath,
        '-out',
        tlsPaths.serverCertPath,
        '-extfile',
        tlsPaths.opensslConfigPath,
      ]),
    });
  });

  it('rotates the Mongo TLS server certificate when host names change', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'servermon-mongo-tls-'));
    const tlsPaths = buildMongoTlsPaths(root);
    await mkdir(tlsPaths.dir, { recursive: true });
    await writeFile(tlsPaths.caKeyPath, 'existing-ca-key');
    await writeFile(tlsPaths.caCertPath, 'existing-ca-cert');
    await writeFile(tlsPaths.serverKeyPath, 'existing-server-key');
    await writeFile(tlsPaths.serverCertPath, 'existing-server-cert');
    await writeFile(tlsPaths.serverPemPath, 'existing-server-pem');
    await writeFile(tlsPaths.opensslConfigPath, 'old-config');

    const commands: Array<{ file: string; args: string[] }> = [];
    const runner = vi.fn(async (file: string, args: string[]) => {
      commands.push({ file, args });
      const outputIndex = args.indexOf('-out');
      if (outputIndex >= 0 && args[outputIndex + 1]) {
        await writeFile(args[outputIndex + 1], 'generated');
      }
      const keyOutputIndex = args.indexOf('-keyout');
      if (keyOutputIndex >= 0 && args[keyOutputIndex + 1]) {
        await writeFile(args[keyOutputIndex + 1], 'generated-key');
      }
      return { stdout: '', stderr: '' };
    });

    try {
      await ensureMongoTlsAssets(tlsPaths, ['db.example.com'], runner);
    } finally {
      await rm(root, { recursive: true, force: true });
    }

    expect(runner).toHaveBeenCalledTimes(2);
    expect(commands[0]).toMatchObject({
      file: 'openssl',
      args: expect.arrayContaining(['req', '-new', '-nodes', '-newkey', 'rsa:4096']),
    });
    expect(commands[1]).toMatchObject({
      file: 'openssl',
      args: expect.arrayContaining(['x509', '-req', '-in', tlsPaths.serverCsrPath]),
    });
  });

  it('rotates the Mongo TLS server certificate before expiry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'servermon-mongo-tls-'));
    const tlsPaths = buildMongoTlsPaths(root);
    await mkdir(tlsPaths.dir, { recursive: true });
    await writeFile(tlsPaths.caKeyPath, 'existing-ca-key');
    await writeFile(tlsPaths.caCertPath, 'existing-ca-cert');
    await writeFile(tlsPaths.serverKeyPath, 'existing-server-key');
    await writeFile(tlsPaths.serverCertPath, 'existing-server-cert');
    await writeFile(tlsPaths.serverPemPath, 'existing-server-pem');

    const runner = vi.fn(async (file: string, args: string[]) => {
      if (args.includes('-checkend')) throw new Error('certificate expires within renewal window');
      const outputIndex = args.indexOf('-out');
      if (outputIndex >= 0 && args[outputIndex + 1]) {
        await writeFile(args[outputIndex + 1], 'generated');
      }
      const keyOutputIndex = args.indexOf('-keyout');
      if (keyOutputIndex >= 0 && args[keyOutputIndex + 1]) {
        await writeFile(args[keyOutputIndex + 1], 'generated-key');
      }
      return { stdout: '', stderr: '' };
    });

    try {
      await ensureMongoTlsAssets(tlsPaths, ['127.0.0.1', 'localhost'], runner);
    } finally {
      await rm(root, { recursive: true, force: true });
    }

    expect(runner).toHaveBeenCalledWith(
      'openssl',
      expect.arrayContaining(['x509', '-checkend', String(30 * 24 * 60 * 60)])
    );
    expect(runner).toHaveBeenCalledWith(
      'openssl',
      expect.arrayContaining(['x509', '-req', '-in', tlsPaths.serverCsrPath])
    );
  });

  it('maps persisted records to DTOs with masked connection strings and fleet warning text', () => {
    const dto = mapManagedDatabaseToDTO({
      _id: { toString: () => 'db-1' },
      name: 'Customer MySQL',
      slug: 'customer-mysql',
      templateId: 'mysql',
      version: '8',
      image: 'mysql:8',
      host: 'db.example.com',
      port: 3307,
      internalPort: 3306,
      username: 'app',
      password: 'mysql-pass',
      databaseName: 'customers',
      dataPath: '/var/lib/servermon/databases/customer-mysql/data',
      publicRoute: true,
      bindAddress: '0.0.0.0',
      sslMode: 'require',
      restartPolicy: 'unless-stopped',
      status: 'running',
      logs: ['created'],
      createdAt: new Date('2026-05-07T10:00:00.000Z'),
      updatedAt: new Date('2026-05-07T10:01:00.000Z'),
    });

    expect(dto.connection.maskedUri).toBe(
      'mysql://app:********@db.example.com:3307/customers?ssl-mode=REQUIRED'
    );
    expect(dto.connection.uri).toBeUndefined();
    expect(dto.securityNotes).toContain(
      'If this machine is part of ServerMon Fleet with no public IP, do not use public route here.'
    );
    expect(dto.explorer.idleTimeoutMinutes).toBe(DATABASE_EXPLORER_IDLE_TIMEOUT_MINUTES);
  });

  it('calculates database explorer idle expiration from the last access time', () => {
    const record = {
      explorerStatus: 'running' as const,
      explorerPort: 49152,
      explorerStartedAt: new Date('2026-05-07T10:00:00.000Z'),
      explorerLastAccessedAt: new Date('2026-05-07T10:10:00.000Z'),
      explorerIdleTimeoutMinutes: 30,
    };

    expect(getExplorerIdleExpiresAt(record)?.toISOString()).toBe('2026-05-07T10:40:00.000Z');
    expect(isExplorerIdleExpired(record, new Date('2026-05-07T10:39:59.000Z'))).toBe(false);
    expect(isExplorerIdleExpired(record, new Date('2026-05-07T10:40:00.000Z'))).toBe(true);
  });

  it('builds a local-only mongo-express sidecar for managed Mongo exploration', () => {
    const request = buildDatabaseExplorerRunRequest({
      id: 'db-1',
      slug: 'main-mongo',
      templateId: 'mongo',
      targetHost: '172.17.0.2',
      targetPort: 27017,
      hostPort: 49152,
      username: 'root',
      password: 'mongo-pass',
      databaseName: 'appdb',
      proxyPath: '/api/modules/databases/db-1/explore/proxy/',
      networkName: 'bridge',
    });

    expect(request.containerName).toBe('servermon-db-explorer-main-mongo');
    expect(request.args).toContain('127.0.0.1:49152:8081');
    expect(request.args).toContain('mongo-express:1.0.2-20-alpine3.19');
    expect(request.args).toContain('ME_CONFIG_MONGODB_SERVER=172.17.0.2');
    expect(request.args).toContain('ME_CONFIG_MONGODB_ADMINUSERNAME=root');
    expect(request.args).toContain('ME_CONFIG_MONGODB_ADMINPASSWORD=mongo-pass');
    expect(request.args).toContain(
      'ME_CONFIG_SITE_BASEURL=/api/modules/databases/db-1/explore/proxy/'
    );
  });

  it('builds mongo-express sidecars with TLS settings for TLS-required Mongo databases', () => {
    const tlsPaths = buildMongoTlsPaths('/var/lib/servermon/databases/main-mongo');
    const request = buildDatabaseExplorerRunRequest({
      id: 'db-1',
      slug: 'main-mongo',
      templateId: 'mongo',
      targetHost: '172.17.0.2',
      targetPort: 27017,
      hostPort: 49152,
      username: 'root',
      password: 'mongo-pass',
      databaseName: 'appdb',
      proxyPath: '/api/modules/databases/db-1/explore/proxy/',
      networkName: 'bridge',
      sslMode: 'require',
      tlsPaths,
    });

    expect(request.args).toContain(
      '/var/lib/servermon/databases/main-mongo/tls:/etc/servermon-db-tls:ro'
    );
    expect(request.args).toContain(
      'ME_CONFIG_MONGODB_URL=mongodb://root:mongo-pass@172.17.0.2:27017/appdb?authSource=admin&tls=true'
    );
    expect(request.args).toContain('ME_CONFIG_MONGODB_TLS=true');
    expect(request.args).toContain('ME_CONFIG_MONGODB_TLS_ALLOW_CERTS=false');
    expect(request.args).toContain('ME_CONFIG_MONGODB_TLS_CA_FILE=/etc/servermon-db-tls/ca.crt');
  });

  it('builds pgweb with a slashless prefix so proxied iframe roots do not 404', () => {
    const request = buildDatabaseExplorerRunRequest({
      id: 'db-1',
      slug: 'main-postgres',
      templateId: 'postgres',
      targetHost: '172.17.0.3',
      targetPort: 5432,
      hostPort: 49153,
      username: 'servermon',
      password: 'pg-pass',
      databaseName: 'servermon',
      proxyPath: '/api/modules/databases/db-1/explore/proxy/',
      networkName: 'bridge',
    });

    expect(request.containerName).toBe('servermon-db-explorer-main-postgres');
    expect(request.args).toContain('127.0.0.1:49153:8081');
    expect(request.args).toContain('sosedoff/pgweb:0.16.2');
    expect(request.args).toContain(
      'PGWEB_DATABASE_URL=postgres://servermon:pg-pass@172.17.0.3:5432/servermon?sslmode=disable'
    );
    expect(request.args).toContain('--prefix=api/modules/databases/db-1/explore/proxy');
    expect(request.args).not.toContain('--prefix=/api/modules/databases/db-1/explore/proxy');
  });

  it('waits for the explorer HTTP listener before marking it ready', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:49152'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:49152'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const sleeper = vi.fn().mockResolvedValue(undefined);

    await waitForExplorerHttpReady(49152, {
      attempts: 3,
      intervalMs: 10,
      path: '/api/modules/databases/db-1/explore/proxy/',
      fetcher,
      sleeper,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:49152/api/modules/databases/db-1/explore/proxy/',
      {
        method: 'GET',
        redirect: 'manual',
      }
    );
    expect(sleeper).toHaveBeenCalledTimes(2);
  });

  it('keeps explorer readiness pointed at root when no upstream path is provided', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('ok', { status: 200 }));

    await waitForExplorerHttpReady(49152, {
      attempts: 1,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:49152/', {
      method: 'GET',
      redirect: 'manual',
    });
  });
});
