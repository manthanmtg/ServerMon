import { describe, expect, it } from 'vitest';
import {
  ServerMonInstallRequestZ,
  buildDefaultServerMonRouteIntent,
  redactInstallArgs,
} from './servermonInstall';

describe('servermonInstall', () => {
  it('validates install requests with defaults', () => {
    const parsed = ServerMonInstallRequestZ.parse({
      mongoUri: 'mongodb://db:27017/servermon',
    });

    expect(parsed).toEqual({
      mongoUri: 'mongodb://db:27017/servermon',
      port: 8912,
      skipMongo: true,
      allowRoot: true,
      installMode: 'release',
      versionTarget: 'latest',
      sourceRef: 'main',
      createPublicRoute: false,
    });
  });

  it('rejects invalid MongoDB URI protocols', () => {
    expect(() => ServerMonInstallRequestZ.parse({ mongoUri: 'https://db.example.com' })).toThrow();
  });

  it('builds default public route intent for a node', () => {
    expect(
      buildDefaultServerMonRouteIntent({
        nodeId: 'node-1',
        nodeName: 'Orion',
        nodeSlug: 'orion',
        port: 8912,
        subdomainHost: 'apps.example.com',
      })
    ).toEqual({
      name: 'Orion ServerMon',
      slug: 'orion-servermon',
      domain: 'orion-servermon.apps.example.com',
      nodeId: 'node-1',
      proxyRuleName: 'servermon',
      target: { localIp: '127.0.0.1', localPort: 8912, protocol: 'http' },
      tlsEnabled: true,
      tlsProvider: 'letsencrypt',
      accessMode: 'servermon_auth',
      websocketEnabled: true,
      compression: true,
      timeoutSeconds: 300,
      maxBodyMb: 64,
    });
  });

  it('redacts MongoDB URI and secret references from command args', () => {
    expect(
      redactInstallArgs({
        port: 8912,
        mongoUri: 'mongodb://user:pass@db/servermon',
        secretRef: 'cmd-1',
      })
    ).toEqual({
      port: 8912,
      mongoUri: '[redacted]',
      secretRef: '[redacted]',
    });
  });
});
