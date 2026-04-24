/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { NodeZodSchema } from '@/models/Node';
import { PublicRouteZodSchema } from '@/models/PublicRoute';
import { renderFrpcToml, hashToml } from '@/lib/fleet/toml';
import { renderServerBlock } from '@/lib/fleet/nginx';
import { parseRendered } from '@/lib/fleet/toml-parse';
import { resolveDomain, type DnsResolver } from '@/lib/fleet/dns';

// Minimal in-memory mongo-ish repo just to simulate domain uniqueness checks.
function makeRouteRepo(existing: Array<{ domain: string; slug: string }>) {
  return {
    findByDomain: vi.fn(
      async (domain: string) => existing.find((r) => r.domain === domain) ?? null
    ),
    findBySlug: vi.fn(async (slug: string) => existing.find((r) => r.slug === slug) ?? null),
  };
}

describe('expose service flow: parse -> frpc render + nginx render -> hash consistency', () => {
  it('adds a new proxy rule to an existing node and renders both configs', () => {
    const node = NodeZodSchema.parse({
      name: 'Atlas',
      slug: 'atlas',
      proxyRules: [
        {
          name: 'web',
          type: 'http',
          localIp: '127.0.0.1',
          localPort: 3000,
          subdomain: 'atlas-web',
        },
      ],
    });

    // Simulate "expose service" adding a second proxy rule for a TCP port.
    const updatedNode = {
      ...node,
      proxyRules: [
        ...node.proxyRules,
        {
          name: 'postgres',
          type: 'tcp' as const,
          localIp: '127.0.0.1',
          localPort: 5432,
          remotePort: 15432,
          customDomains: [],
          enabled: true,
          status: 'disabled' as const,
        },
      ],
    };

    const rendered1 = renderFrpcToml({
      serverAddr: 'hub.example.com',
      serverPort: 7000,
      authToken: 'tok',
      node: updatedNode,
    });
    const hash1 = hashToml(rendered1);

    // Re-render with identical input -> same hash every time.
    const rendered2 = renderFrpcToml({
      serverAddr: 'hub.example.com',
      serverPort: 7000,
      authToken: 'tok',
      node: updatedNode,
    });
    expect(hashToml(rendered2)).toBe(hash1);

    // Parse-back roundtrip: proxies should both be present.
    const parsed = parseRendered(rendered1);
    expect(parsed.proxies.map((p) => p.name).sort()).toEqual(['atlas-postgres', 'atlas-web']);

    // Changing one port should produce a different hash.
    const mutated = {
      ...updatedNode,
      proxyRules: updatedNode.proxyRules.map((r) =>
        r.name === 'postgres' ? { ...r, remotePort: 15433 } : r
      ),
    };
    const rendered3 = renderFrpcToml({
      serverAddr: 'hub.example.com',
      serverPort: 7000,
      authToken: 'tok',
      node: mutated,
    });
    expect(hashToml(rendered3)).not.toBe(hash1);
  });

  it('renders an nginx server block with TLS + websocket and stable hash', () => {
    const route = PublicRouteZodSchema.parse({
      name: 'Atlas Web',
      slug: 'atlas-web',
      domain: 'atlas.example.com',
      nodeId: 'node-1',
      proxyRuleName: 'web',
      target: { localIp: '127.0.0.1', localPort: 3000, protocol: 'http' },
      tlsEnabled: true,
      http2Enabled: true,
      websocketEnabled: true,
    });

    const rendered = renderServerBlock(
      {
        domain: route.domain,
        path: route.path,
        tlsEnabled: route.tlsEnabled,
        http2Enabled: route.http2Enabled,
        websocketEnabled: route.websocketEnabled,
        maxBodyMb: route.maxBodyMb,
        timeoutSeconds: route.timeoutSeconds,
        compression: route.compression,
        accessMode: route.accessMode,
        headers: Object.fromEntries(
          Object.entries(route.headers || {}).map(([k, v]) => [k, String(v)])
        ),
        slug: route.slug,
      },
      { frpsVhostPort: 8080 }
    );

    expect(rendered).toContain('listen 443 ssl;');
    expect(rendered).toContain('http2 on;');
    expect(rendered).toContain('proxy_pass http://127.0.0.1:8080;');
    expect(rendered).toContain('server_name atlas.example.com;');
    expect(rendered).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(rendered).toContain('return 301 https://');

    // Hash is stable across identical renders.
    expect(hashToml(rendered)).toBe(hashToml(rendered));
  });

  it('detects domain collision before accepting a new route', async () => {
    const repo = makeRouteRepo([{ domain: 'atlas.example.com', slug: 'atlas-web' }]);

    // Simulate POST /api/fleet/routes trying to create a colliding domain.
    const incoming = PublicRouteZodSchema.parse({
      name: 'Atlas Copy',
      slug: 'atlas-web-2',
      domain: 'atlas.example.com',
      nodeId: 'node-1',
      proxyRuleName: 'web',
      target: { localIp: '127.0.0.1', localPort: 3000, protocol: 'http' },
    });

    const collision = await repo.findByDomain(incoming.domain);
    expect(collision).not.toBeNull();
    expect(collision?.slug).toBe('atlas-web');

    // Distinct domain passes.
    const ok = await repo.findByDomain('other.example.com');
    expect(ok).toBeNull();
  });

  it('rejects slug that violates the DNS-safe pattern', () => {
    expect(() =>
      PublicRouteZodSchema.parse({
        name: 'Bad',
        slug: 'Has Spaces',
        domain: 'example.com',
        nodeId: 'n',
        proxyRuleName: 'p',
        target: { localIp: '127.0.0.1', localPort: 80, protocol: 'http' },
      })
    ).toThrow();
    expect(() =>
      PublicRouteZodSchema.parse({
        name: 'Bad',
        slug: 'UPPER',
        domain: 'example.com',
        nodeId: 'n',
        proxyRuleName: 'p',
        target: { localIp: '127.0.0.1', localPort: 80, protocol: 'http' },
      })
    ).toThrow();
    // Dots disallowed (keeps labels as a single DNS-safe segment).
    expect(() =>
      PublicRouteZodSchema.parse({
        name: 'Bad',
        slug: 'has.dots',
        domain: 'example.com',
        nodeId: 'n',
        proxyRuleName: 'p',
        target: { localIp: '127.0.0.1', localPort: 80, protocol: 'http' },
      })
    ).toThrow();
  });

  it('refuses to render nginx for an unsafe wildcard domain', () => {
    expect(() =>
      renderServerBlock(
        {
          domain: '*.example.com',
          path: '/',
          tlsEnabled: false,
          http2Enabled: true,
          websocketEnabled: false,
          maxBodyMb: 32,
          timeoutSeconds: 60,
          compression: false,
          accessMode: 'public',
          headers: {},
          slug: 'x',
        },
        { frpsVhostPort: 8080 }
      )
    ).toThrow(/wildcard/);
  });

  it('uses an injected DNS resolver (no real network)', async () => {
    const resolver: DnsResolver = {
      resolve4: vi.fn(async () => ['203.0.113.10']),
      resolveCname: vi.fn(async () => []),
    };
    const out = await resolveDomain('atlas.example.com', resolver);
    expect(out.ips).toEqual(['203.0.113.10']);
    expect(resolver.resolve4).toHaveBeenCalledWith('atlas.example.com');
  });
});
