/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildServerMonBridgeSnapshot,
  collectServerMonBridgeCapabilities,
  deriveServerMonBridgeToken,
} from './servermonBridge';

describe('servermonBridge', () => {
  const originalBridgeToken = process.env.SERVERMON_AGENT_BRIDGE_TOKEN;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    delete process.env.SERVERMON_AGENT_BRIDGE_TOKEN;
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    if (originalBridgeToken === undefined) {
      delete process.env.SERVERMON_AGENT_BRIDGE_TOKEN;
    } else {
      process.env.SERVERMON_AGENT_BRIDGE_TOKEN = originalBridgeToken;
    }
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('builds exact local route candidates from ServerMon app module data without secrets', () => {
    const snapshot = buildServerMonBridgeSnapshot({
      app: {
        port: 8912,
        version: '1.2.3',
      },
      databases: [
        {
          id: 'db-1',
          name: 'Main Mongo',
          slug: 'main-mongo',
          templateId: 'mongo',
          version: '8',
          image: 'mongo:8',
          host: '127.0.0.1',
          port: 27017,
          internalPort: 27017,
          username: 'servermon',
          databaseName: 'defaultdb',
          dataPath: '/var/lib/servermon/databases/main-mongo/data',
          publicRoute: false,
          bindAddress: '127.0.0.1',
          sslMode: 'disable',
          restartPolicy: 'unless-stopped',
          status: 'running',
          connection: {
            maskedUri: 'mongodb://servermon:********@127.0.0.1:27017/defaultdb?authSource=admin',
            cli: 'mongodb://servermon:********@127.0.0.1:27017/defaultdb?authSource=admin',
            host: '127.0.0.1',
            port: 27017,
            databaseName: 'defaultdb',
          },
          explorer: {
            status: 'stopped',
            kind: 'mongo-express',
            logs: [],
            idleTimeoutMinutes: 30,
          },
          securityNotes: ['Local-only mode binds to 127.0.0.1.'],
          logs: [],
        },
        {
          id: 'db-2',
          name: 'Stopped Postgres',
          slug: 'stopped-postgres',
          templateId: 'postgres',
          version: '17',
          image: 'postgres:17',
          host: '127.0.0.1',
          port: 5432,
          internalPort: 5432,
          username: 'servermon',
          databaseName: 'servermon',
          dataPath: '/var/lib/servermon/databases/stopped-postgres/data',
          publicRoute: false,
          bindAddress: '127.0.0.1',
          sslMode: 'disable',
          restartPolicy: 'unless-stopped',
          status: 'stopped',
          connection: {
            maskedUri: 'postgresql://servermon:********@127.0.0.1:5432/servermon',
            cli: 'psql "postgresql://servermon:********@127.0.0.1:5432/servermon"',
            host: '127.0.0.1',
            port: 5432,
            databaseName: 'servermon',
          },
          explorer: {
            status: 'stopped',
            kind: 'pgweb',
            logs: [],
            idleTimeoutMinutes: 30,
          },
          securityNotes: ['Local-only mode binds to 127.0.0.1.'],
          logs: [],
        },
      ],
      now: () => new Date('2026-05-07T11:30:00.000Z'),
    });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.app).toMatchObject({
      running: true,
      port: 8912,
      version: '1.2.3',
    });
    expect(snapshot.modules.databases).toMatchObject({
      running: true,
      total: 2,
      runningCount: 1,
    });
    expect(snapshot.routeCandidates).toHaveLength(2);
    expect(snapshot.routeCandidates[0]).toMatchObject({
      id: 'servermon:app',
      kind: 'servermon',
      module: 'servermon',
      name: 'ServerMon app',
      target: { localIp: '127.0.0.1', localPort: 8912, protocol: 'http' },
    });
    expect(snapshot.routeCandidates[1]).toMatchObject({
      id: 'database:db-1',
      kind: 'database',
      module: 'databases',
      name: 'Main Mongo',
      target: { localIp: '127.0.0.1', localPort: 27017, protocol: 'tcp' },
      metadata: {
        database: {
          id: 'db-1',
          engine: 'mongo',
          version: '8',
          dataPath: '/var/lib/servermon/databases/main-mongo/data',
        },
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain('password');
    expect(JSON.stringify(snapshot)).not.toContain('mongodb://');
  });

  it('collects the local bridge document from the ServerMon app on loopback', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: 1,
        collectedAt: '2026-05-07T11:30:00.000Z',
        app: { running: true, port: 8912 },
        modules: { databases: { running: false, total: 0, runningCount: 0 } },
        routeCandidates: [
          {
            id: 'servermon:app',
            kind: 'servermon',
            module: 'servermon',
            name: 'ServerMon app',
            status: 'running',
            target: { localIp: '127.0.0.1', localPort: 8912, protocol: 'http' },
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
            securityNotes: [],
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const snapshot = await collectServerMonBridgeCapabilities({
      port: 8912,
      fetchImpl,
      readFile: async () => '',
    });

    expect(snapshot?.routeCandidates[0]?.id).toBe('servermon:app');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8912/api/fleet/public/servermon-bridge',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-servermon-agent': 'servermon-agent',
        }),
      })
    );
  });

  it('derives the bridge auth token from the ServerMon app env file', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    })) as unknown as typeof fetch;

    await collectServerMonBridgeCapabilities({
      port: 8912,
      fetchImpl,
      readFile: async () => 'JWT_SECRET="fleet-secret"\n',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8912/api/fleet/public/servermon-bridge',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-servermon-agent-bridge-token': deriveServerMonBridgeToken('fleet-secret'),
        }),
      })
    );
  });
});
