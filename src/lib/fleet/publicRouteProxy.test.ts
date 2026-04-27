import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPublicRouteProxyRule,
  type PublicRouteProxyRule,
  type PublicRouteProxySource,
  upsertPublicRouteProxyRule,
} from './publicRouteProxy';

const baseRoute: PublicRouteProxySource = {
  slug: 'api',
  domain: 'api.routes.example.com',
  proxyRuleName: 'route-api',
  target: {
    localIp: '10.0.0.12',
    localPort: 8080,
    protocol: 'http',
  },
};

describe('buildPublicRouteProxyRule', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a route slug as the FRP subdomain when the domain belongs to the subdomain host', () => {
    expect(buildPublicRouteProxyRule(baseRoute, 'routes.example.com')).toEqual({
      name: 'route-api',
      type: 'http',
      subdomain: 'api',
      localIp: '10.0.0.12',
      localPort: 8080,
      customDomains: [],
      enabled: true,
      status: 'disabled',
    });
  });

  it('uses a custom domain for HTTP routes outside the configured subdomain host', () => {
    const rule = buildPublicRouteProxyRule(
      { ...baseRoute, domain: 'api.customer.example.net' },
      'routes.example.com'
    );

    expect(rule).toMatchObject({
      type: 'http',
      customDomains: ['api.customer.example.net'],
    });
    expect(rule.subdomain).toBeUndefined();
  });

  it('marks rules disabled when the route is explicitly disabled', () => {
    expect(
      buildPublicRouteProxyRule({ ...baseRoute, enabled: false }, 'routes.example.com')
    ).toMatchObject({
      enabled: false,
      status: 'disabled',
    });
  });

  it('creates TCP rules with a generated remote port and no custom domains', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2345);

    expect(
      buildPublicRouteProxyRule(
        {
          ...baseRoute,
          target: { ...baseRoute.target, protocol: 'tcp', localPort: 5432 },
        },
        'routes.example.com'
      )
    ).toEqual({
      name: 'route-api',
      type: 'tcp',
      localIp: '10.0.0.12',
      localPort: 5432,
      remotePort: 11345,
      customDomains: [],
      enabled: true,
      status: 'disabled',
    });
  });
});

describe('upsertPublicRouteProxyRule', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appends a new proxy rule and reports a change', () => {
    const rules: PublicRouteProxyRule[] = [];

    expect(upsertPublicRouteProxyRule(rules, baseRoute, 'routes.example.com')).toBe(true);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      name: 'route-api',
      subdomain: 'api',
      localIp: '10.0.0.12',
      localPort: 8080,
    });
  });

  it('leaves an equivalent existing rule unchanged', () => {
    const rules = [buildPublicRouteProxyRule(baseRoute, 'routes.example.com')];

    expect(upsertPublicRouteProxyRule(rules, baseRoute, 'routes.example.com')).toBe(false);
    expect(rules).toEqual([buildPublicRouteProxyRule(baseRoute, 'routes.example.com')]);
  });

  it('updates changed route settings while preserving active status and last error', () => {
    const rules: PublicRouteProxyRule[] = [
      {
        ...buildPublicRouteProxyRule(baseRoute, 'routes.example.com'),
        status: 'active',
        lastError: 'previous DNS warning',
      },
    ];

    expect(
      upsertPublicRouteProxyRule(
        rules,
        {
          ...baseRoute,
          domain: 'api.customer.example.net',
          target: { ...baseRoute.target, localIp: '10.0.0.20', localPort: 9090 },
        },
        'routes.example.com'
      )
    ).toBe(true);

    expect(rules[0]).toMatchObject({
      localIp: '10.0.0.20',
      localPort: 9090,
      customDomains: ['api.customer.example.net'],
      status: 'active',
      lastError: 'previous DNS warning',
    });
    expect(rules[0].subdomain).toBeUndefined();
  });

  it('keeps an existing TCP remote port stable during route updates', () => {
    const rules: PublicRouteProxyRule[] = [
      {
        name: 'route-api',
        type: 'tcp',
        localIp: '10.0.0.12',
        localPort: 5432,
        remotePort: 12001,
        customDomains: [],
        enabled: true,
        status: 'disabled',
      },
    ];
    vi.spyOn(Math, 'random').mockReturnValue(0.9876);

    expect(
      upsertPublicRouteProxyRule(
        rules,
        {
          ...baseRoute,
          target: { ...baseRoute.target, protocol: 'tcp', localPort: 5433 },
        },
        'routes.example.com'
      )
    ).toBe(true);

    expect(rules[0]).toMatchObject({
      localPort: 5433,
      remotePort: 12001,
    });
  });

  it('removes TCP-only fields when an existing rule switches to HTTP', () => {
    const rules: PublicRouteProxyRule[] = [
      {
        name: 'route-api',
        type: 'tcp',
        localIp: '10.0.0.12',
        localPort: 5432,
        remotePort: 12001,
        customDomains: [],
        enabled: true,
        status: 'disabled',
      },
    ];

    expect(upsertPublicRouteProxyRule(rules, baseRoute, 'routes.example.com')).toBe(true);
    expect(rules[0]).toEqual({
      name: 'route-api',
      type: 'http',
      subdomain: 'api',
      localIp: '10.0.0.12',
      localPort: 8080,
      customDomains: [],
      enabled: true,
      status: 'disabled',
      lastError: undefined,
    });
  });
});
