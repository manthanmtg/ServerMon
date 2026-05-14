/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { buildFleetRouteSuggestions } from './routeSuggestions';
import type { FleetRouteSuggestionNode } from './routeSuggestions';
import type { ServerMonBridgeRouteCandidate } from './servermonBridge';

describe('buildFleetRouteSuggestions', () => {
  const servermonCandidate: ServerMonBridgeRouteCandidate = {
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
  };

  const appCandidate: ServerMonBridgeRouteCandidate = {
    id: 'app:admin',
    kind: 'app',
    module: 'apps',
    name: 'Admin console',
    status: 'running',
    target: { localIp: '127.0.0.1', localPort: 4000, protocol: 'http' },
    route: {
      eligible: true,
      templateSlug: 'generic-http',
      proxyRuleName: 'admin-console',
      accessMode: 'servermon_auth',
      tlsEnabled: true,
      websocketEnabled: false,
      compression: true,
      timeoutSeconds: 120,
      maxBodyMb: 16,
    },
    securityNotes: [],
  };

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
        servermonCandidate,
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

  it('builds prefilled public-route forms only for web route candidates', () => {
    const suggestions = buildFleetRouteSuggestions({
      node,
      existingRoutes: [],
      subdomainHost: 'apps.example.com',
    });

    expect(suggestions).toHaveLength(1);
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
    expect(suggestions.some((suggestion) => suggestion.id === 'database:db-1')).toBe(false);
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

    expect(suggestions).toEqual([]);
  });

  it('falls back to servermon status when bridge candidates are missing', () => {
    const suggestions = buildFleetRouteSuggestions({
      node: { ...node, _id: { toString: () => 'object-node-1' }, servermonBridge: null },
      existingRoutes: [],
      subdomainHost: 'apps.example.com',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      id: 'servermon:app',
      badge: 'ServerMon',
      targetLabel: '127.0.0.1:8912 · http',
      sourceLabel: 'ServerMon app',
      form: {
        nodeId: 'object-node-1',
        domainMode: 'hub_subdomain',
        domain: 'orion-servermon.apps.example.com',
        tlsProvider: 'letsencrypt',
      },
    });
  });

  it('does not fall back when servermon is not healthy and running', () => {
    const suggestions = buildFleetRouteSuggestions({
      node: {
        ...node,
        servermon: { ...node.servermon!, healthStatus: 'unhealthy' },
        servermonBridge: null,
      },
      existingRoutes: [],
      subdomainHost: 'apps.example.com',
    });

    expect(suggestions).toEqual([]);
  });

  it('uses custom domain mode when no hub subdomain host is available', () => {
    const suggestions = buildFleetRouteSuggestions({
      node: { ...node, servermonBridge: null },
      existingRoutes: [],
    });

    expect(suggestions[0].form).toMatchObject({
      domainMode: 'custom',
      domain: 'orion-servermon',
    });
  });

  it('filters stopped and route-ineligible bridge candidates', () => {
    const suggestions = buildFleetRouteSuggestions({
      node: {
        ...node,
        servermonBridge: {
          ...node.servermonBridge!,
          routeCandidates: [
            { ...servermonCandidate, status: 'stopped' },
            {
              ...appCandidate,
              id: 'app:disabled',
              route: { ...appCandidate.route, eligible: false },
            },
          ],
        },
      },
      existingRoutes: [],
      subdomainHost: 'apps.example.com',
    });

    expect(suggestions).toEqual([]);
  });

  it('builds generic app suggestions from bridge route defaults', () => {
    const suggestions = buildFleetRouteSuggestions({
      node: {
        ...node,
        servermon: undefined,
        servermonBridge: {
          ...node.servermonBridge!,
          routeCandidates: [appCandidate],
        },
      },
      existingRoutes: [],
      subdomainHost: 'apps.example.com',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      id: 'app:admin',
      kind: 'app',
      title: 'Service detected',
      badge: 'apps',
      description: 'Admin console is running on this fleet machine.',
      sourceLabel: 'ServerMon module · 2026-05-07T11:30:00.000Z',
      form: {
        name: 'Admin console',
        slug: 'orion-admin-console',
        domain: 'orion-admin-console.apps.example.com',
        templateSlug: 'generic-http',
        proxyRuleName: 'admin-console',
        target: { localIp: '127.0.0.1', localPort: 4000, protocol: 'http' },
        websocketEnabled: false,
        timeoutSeconds: 120,
        maxBodyMb: 16,
      },
    });
  });

  it('skips generic app candidates with an existing matching target route', () => {
    const suggestions = buildFleetRouteSuggestions({
      node: {
        ...node,
        servermon: undefined,
        servermonBridge: {
          ...node.servermonBridge!,
          routeCandidates: [appCandidate],
        },
      },
      existingRoutes: [
        {
          name: 'Admin console',
          slug: 'admin-console',
          domain: 'admin.example.com',
          target: { localIp: '127.0.0.1', localPort: 4000, protocol: 'http' },
        },
      ],
      subdomainHost: 'apps.example.com',
    });

    expect(suggestions).toEqual([]);
  });
});
