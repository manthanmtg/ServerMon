/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import {
  CreateManagedDatabaseSchema,
  buildDatabaseExplorerRunRequest,
  buildDockerRunRequest,
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
      fetcher,
      sleeper,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:49152/', {
      method: 'GET',
      redirect: 'manual',
    });
    expect(sleeper).toHaveBeenCalledTimes(2);
  });
});
