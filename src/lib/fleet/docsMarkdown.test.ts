import { describe, it, expect } from 'vitest';
import {
  renderNodeDoc,
  renderRouteDoc,
  type DocsNode,
  type DocsRoute,
  type DocsRevisionBrief,
} from './docsMarkdown';

const fixedNow = new Date('2026-04-24T12:00:00Z');

function baseNode(overrides: Partial<DocsNode> = {}): DocsNode {
  return {
    _id: 'n1',
    name: 'Edge 01',
    slug: 'edge-01',
    description: 'Primary edge node serving region A.',
    status: 'online',
    tunnelStatus: 'connected',
    tags: ['prod', 'region-a'],
    agentVersion: '1.2.3',
    frpcVersion: '0.58.0',
    hardware: {
      cpuCount: 8,
      totalRam: 16384,
      diskSize: 500,
      osDistro: 'Debian 12',
      arch: 'x86_64',
    },
    frpcConfig: {
      protocol: 'tcp',
      tlsEnabled: true,
      heartbeatInterval: 30,
      heartbeatTimeout: 90,
    },
    proxyRules: [
      {
        name: 'web',
        type: 'http',
        localPort: 8080,
        subdomain: 'web',
        enabled: true,
        status: 'active',
      },
      {
        name: 'ssh',
        type: 'tcp',
        localPort: 22,
        remotePort: 6000,
        enabled: false,
        status: 'disabled',
      },
    ],
    capabilities: { pty: true, docker: false, firewall: true },
    maintenance: { enabled: false },
    lastSeen: new Date('2026-04-24T11:59:30Z'),
    lastBootAt: new Date('2026-04-24T08:00:00Z'),
    createdBy: 'alice@example.com',
    ...overrides,
  };
}

function baseRoute(overrides: Partial<DocsRoute> = {}): DocsRoute {
  return {
    _id: 'r1',
    name: 'App Route',
    slug: 'app-route',
    domain: 'app.example.com',
    path: '/',
    nodeId: 'n1',
    proxyRuleName: 'web',
    target: { localIp: '127.0.0.1', localPort: 8080, protocol: 'http' },
    tlsEnabled: true,
    tlsProvider: 'letsencrypt',
    accessMode: 'servermon_auth',
    status: 'active',
    healthStatus: 'healthy',
    dnsStatus: 'resolved',
    websocketEnabled: true,
    http2Enabled: true,
    maxBodyMb: 32,
    timeoutSeconds: 60,
    compression: true,
    lastCheckedAt: new Date('2026-04-24T11:58:00Z'),
    createdBy: 'alice@example.com',
    ...overrides,
  };
}

function baseRev(overrides: Partial<DocsRevisionBrief> = {}): DocsRevisionBrief {
  return {
    _id: 'rev1',
    kind: 'frpc',
    version: 3,
    hash: 'abcd1234',
    createdAt: new Date('2026-04-23T10:00:00Z'),
    createdBy: 'alice@example.com',
    appliedAt: new Date('2026-04-23T10:05:00Z'),
    ...overrides,
  };
}

describe('renderNodeDoc', () => {
  it('renders full header, description, and status section', () => {
    const md = renderNodeDoc(baseNode(), [], [], fixedNow);
    expect(md).toContain('# Edge 01 (edge-01)');
    expect(md).toContain('Primary edge node serving region A.');
    expect(md).toContain('## Status');
    expect(md).toContain('- Top-level: online');
    expect(md).toContain('- Tunnel: connected');
    expect(md).toContain('- Agent: 1.2.3 (frpc 0.58.0)');
    expect(md).toContain('- Maintenance: no');
    expect(md).toContain('- Last seen: 2026-04-24T11:59:30.000Z');
    expect(md).toContain('- Last boot: 2026-04-24T08:00:00.000Z');
  });

  it('renders maintenance reason when enabled', () => {
    const md = renderNodeDoc(
      baseNode({ maintenance: { enabled: true, reason: 'kernel upgrade' } }),
      [],
      [],
      fixedNow
    );
    expect(md).toContain('- Maintenance: yes (kernel upgrade)');
  });

  it('renders hardware table', () => {
    const md = renderNodeDoc(baseNode(), [], [], fixedNow);
    expect(md).toContain('## Hardware');
    expect(md).toContain('| CPU | RAM | Disk | OS | Arch |');
    expect(md).toContain('| 8 | 16384 | 500 | Debian 12 | x86_64 |');
  });

  it('omits hardware section when hardware is missing', () => {
    const node = baseNode();
    delete node.hardware;
    const md = renderNodeDoc(node, [], [], fixedNow);
    expect(md).not.toContain('## Hardware');
  });

  it('renders FRPC Config section', () => {
    const md = renderNodeDoc(baseNode(), [], [], fixedNow);
    expect(md).toContain('## FRPC Config');
    expect(md).toContain('- Protocol: tcp');
    expect(md).toContain('- TLS: yes');
    expect(md).toContain('- Heartbeat: 30s / timeout 90s');
  });

  it('renders proxy rules table with subdomain and remote port', () => {
    const md = renderNodeDoc(baseNode(), [], [], fixedNow);
    expect(md).toContain('## Proxy Rules');
    expect(md).toContain('| Name | Type | Local | Remote/Subdomain | Enabled | Status |');
    expect(md).toContain('| web | http | 8080 | web | yes | active |');
    expect(md).toContain('| ssh | tcp | 22 | 6000 | no | disabled |');
  });

  it('omits proxy rules section when empty', () => {
    const md = renderNodeDoc(baseNode({ proxyRules: [] }), [], [], fixedNow);
    expect(md).not.toContain('## Proxy Rules');
  });

  it('renders public routes table when routes present', () => {
    const routes: DocsRoute[] = [
      baseRoute(),
      baseRoute({ domain: 'api.example.com', path: '/v1' }),
    ];
    const md = renderNodeDoc(baseNode(), routes, [], fixedNow);
    expect(md).toContain('## Public Routes');
    expect(md).toContain('| Domain | Path | Access | Status |');
    expect(md).toContain('| app.example.com | / | servermon_auth | active |');
    expect(md).toContain('| api.example.com | /v1 | servermon_auth | active |');
  });

  it('omits public routes section when no routes', () => {
    const md = renderNodeDoc(baseNode(), [], [], fixedNow);
    expect(md).not.toContain('## Public Routes');
  });

  it('renders only enabled capabilities', () => {
    const md = renderNodeDoc(baseNode(), [], [], fixedNow);
    expect(md).toContain('## Capabilities');
    expect(md).toContain('- pty');
    expect(md).toContain('- firewall');
    expect(md).not.toContain('- docker');
  });

  it('omits capabilities section when none enabled', () => {
    const md = renderNodeDoc(
      baseNode({ capabilities: { pty: false, docker: false } }),
      [],
      [],
      fixedNow
    );
    expect(md).not.toContain('## Capabilities');
  });

  it('renders tags with backticks', () => {
    const md = renderNodeDoc(baseNode(), [], [], fixedNow);
    expect(md).toContain('## Tags');
    expect(md).toContain('`prod`, `region-a`');
  });

  it('omits tags section when empty', () => {
    const md = renderNodeDoc(baseNode({ tags: [] }), [], [], fixedNow);
    expect(md).not.toContain('## Tags');
  });

  it('renders recent revisions table', () => {
    const md = renderNodeDoc(
      baseNode(),
      [],
      [baseRev(), baseRev({ version: 4, hash: 'feed' })],
      fixedNow
    );
    expect(md).toContain('## Recent Revisions');
    expect(md).toContain('| Version | Kind | Hash | Created | By | Applied |');
    expect(md).toContain(
      '| 3 | frpc | abcd1234 | 2026-04-23T10:00:00.000Z | alice@example.com | 2026-04-23T10:05:00.000Z |'
    );
    expect(md).toContain('| 4 | frpc | feed |');
  });

  it('renders em-dash for missing fields', () => {
    const node = baseNode({
      agentVersion: undefined,
      frpcVersion: undefined,
      lastSeen: undefined,
      lastBootAt: undefined,
    });
    const md = renderNodeDoc(node, [], [], fixedNow);
    expect(md).toContain('- Agent: — (frpc —)');
    expect(md).toContain('- Last seen: —');
    expect(md).toContain('- Last boot: —');
  });

  it('includes generated ISO timestamp footer', () => {
    const md = renderNodeDoc(baseNode(), [], [], fixedNow);
    expect(md).toContain('---');
    expect(md).toContain(`Generated: ${fixedNow.toISOString()}`);
  });

  it('produces deterministic output for identical input', () => {
    const n = baseNode();
    const a = renderNodeDoc(n, [], [baseRev()], fixedNow);
    const b = renderNodeDoc(n, [], [baseRev()], fixedNow);
    expect(a).toBe(b);
  });
});

describe('renderRouteDoc', () => {
  it('renders header with slug and node name', () => {
    const md = renderRouteDoc(baseRoute(), [], 'edge-01', fixedNow);
    expect(md).toContain('# App Route (app-route)');
    expect(md).toContain('Public route on node `edge-01` via proxy `web`.');
  });

  it('falls back to proxy-only intro when node name missing', () => {
    const md = renderRouteDoc(baseRoute(), [], undefined, fixedNow);
    expect(md).toContain('Public route via proxy `web`.');
  });

  it('renders status section', () => {
    const md = renderRouteDoc(baseRoute(), [], 'edge-01', fixedNow);
    expect(md).toContain('## Status');
    expect(md).toContain('- Top-level: active');
    expect(md).toContain('- Health: healthy');
    expect(md).toContain('- DNS: resolved');
    expect(md).toContain('- Last checked: 2026-04-24T11:58:00.000Z');
  });

  it('renders last error when present', () => {
    const md = renderRouteDoc(
      baseRoute({ lastError: 'upstream timeout' }),
      [],
      'edge-01',
      fixedNow
    );
    expect(md).toContain('- Last error: upstream timeout');
  });

  it('renders target section', () => {
    const md = renderRouteDoc(baseRoute(), [], 'edge-01', fixedNow);
    expect(md).toContain('## Target');
    expect(md).toContain('- Domain: app.example.com');
    expect(md).toContain('- Path: /');
    expect(md).toContain('- Upstream: 127.0.0.1:8080');
    expect(md).toContain('- Protocol: http');
  });

  it('renders access section with TLS provider when TLS enabled', () => {
    const md = renderRouteDoc(baseRoute(), [], 'edge-01', fixedNow);
    expect(md).toContain('## Access');
    expect(md).toContain('- Mode: servermon_auth');
    expect(md).toContain('- TLS: yes');
    expect(md).toContain('- TLS provider: letsencrypt');
  });

  it('omits TLS provider line when TLS disabled', () => {
    const md = renderRouteDoc(
      baseRoute({ tlsEnabled: false, tlsProvider: undefined }),
      [],
      'edge-01',
      fixedNow
    );
    expect(md).toContain('- TLS: no');
    expect(md).not.toContain('- TLS provider:');
  });

  it('renders ingress section', () => {
    const md = renderRouteDoc(baseRoute(), [], 'edge-01', fixedNow);
    expect(md).toContain('## Ingress');
    expect(md).toContain('- WebSocket: yes');
    expect(md).toContain('- HTTP/2: yes');
    expect(md).toContain('- Max body: 32 MB');
    expect(md).toContain('- Timeout: 60s');
    expect(md).toContain('- Compression: yes');
  });

  it('renders revisions table', () => {
    const md = renderRouteDoc(baseRoute(), [baseRev({ kind: 'nginx' })], 'edge-01', fixedNow);
    expect(md).toContain('## Revisions');
    expect(md).toContain('| Version | Kind | Hash | Created | By | Applied |');
    expect(md).toContain('| 3 | nginx | abcd1234 |');
  });

  it('omits revisions section when list empty', () => {
    const md = renderRouteDoc(baseRoute(), [], 'edge-01', fixedNow);
    expect(md).not.toContain('## Revisions');
  });

  it('includes generated footer', () => {
    const md = renderRouteDoc(baseRoute(), [], 'edge-01', fixedNow);
    expect(md).toContain('---');
    expect(md).toContain(`Generated: ${fixedNow.toISOString()}`);
  });

  it('is deterministic for identical input', () => {
    const r = baseRoute();
    const a = renderRouteDoc(r, [baseRev()], 'edge-01', fixedNow);
    const b = renderRouteDoc(r, [baseRev()], 'edge-01', fixedNow);
    expect(a).toBe(b);
  });
});
