/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { buildFleetRouteSuggestions } from './routeSuggestions';
import type { FleetRouteSuggestionNode } from './routeSuggestions';

describe('buildFleetRouteSuggestions', () => {
  const node: FleetRouteSuggestionNode = {
    _id: 'node-1',
    name: 'Orion',
    slug: 'orion',
    tunnelStatus: 'connected',
    servermon: {
      installed: true,
      serviceName: 'servermon.service',
      serviceState: 'running',
      serviceEnabled: true,
      port: 8912,
      healthUrl: 'http://127.0.0.1:8912/api/health',
      healthStatus: 'healthy',
      lastCheckedAt: '2026-05-07T11:30:00.000Z',
    },
    servermonBridge: {
      schemaVersion: 1,
      collectedAt: '2026-05-07T11:30:00.000Z',
      app: { running: true, port: 8912 },
      modules: {
        databases: { running: true, total: 1, runningCount: 1 },
      },
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
        {
          id: 'database:db-1',
          kind: 'database',
          module: 'databases',
          name: 'Main Mongo',
          status: 'running',
          target: { localIp: '127.0.0.1', localPort: 27017, protocol: 'tcp' },
          route: {
            eligible: true,
            templateSlug: 'generic-tcp',
            proxyRuleName: 'main-mongo',
            accessMode: 'public',
            tlsEnabled: false,
            websocketEnabled: false,
            compression: false,
            timeoutSeconds: 60,
            maxBodyMb: 32,
          },
          metadata: {
            database: {
              id: 'db-1',
              slug: 'main-mongo',
              engine: 'mongo',
              version: '8',
              dataPath: '/var/lib/servermon/databases/main-mongo/data',
            },
          },
          securityNotes: ['Expose only when remote database access is intended.'],
        },
      ],
    },
  };

  it('builds prefilled public-route forms from ServerMon bridge route candidates', () => {
    const suggestions = buildFleetRouteSuggestions({
      node,
      existingRoutes: [],
      subdomainHost: 'apps.example.com',
    });

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({
      id: 'servermon:app',
      title: 'ServerMon app detected',
      form: {
        name: 'Orion ServerMon',
        slug: 'orion-servermon',
        domain: 'orion-servermon.apps.example.com',
        proxyRuleName: 'servermon',
        target: { localIp: '127.0.0.1', localPort: 8912, protocol: 'http' },
        accessMode: 'servermon_auth',
        websocketEnabled: true,
        createNewProxyRule: true,
      },
    });
    expect(suggestions[1]).toMatchObject({
      id: 'database:db-1',
      title: 'MongoDB database detected',
      form: {
        name: 'Main Mongo',
        slug: 'orion-main-mongo',
        domain: 'orion-main-mongo.apps.example.com',
        proxyRuleName: 'main-mongo',
        target: { localIp: '127.0.0.1', localPort: 27017, protocol: 'tcp' },
        accessMode: 'public',
        tlsEnabled: false,
        createNewProxyRule: true,
      },
    });
  });

  it('skips candidates that already have a matching public route', () => {
    const suggestions = buildFleetRouteSuggestions({
      node,
      existingRoutes: [
        {
          _id: 'route-1',
          nodeId: 'node-1',
          name: 'Orion ServerMon',
          slug: 'orion-servermon',
          domain: 'orion-servermon.apps.example.com',
          proxyRuleName: 'servermon',
          target: { localIp: '127.0.0.1', localPort: 8912, protocol: 'http' },
          templateId: 'servermon',
        },
      ],
      subdomainHost: 'apps.example.com',
    });

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual(['database:db-1']);
  });
});
