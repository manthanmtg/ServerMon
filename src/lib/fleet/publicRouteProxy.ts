export interface PublicRouteProxySource {
  slug: string;
  domain: string;
  proxyRuleName: string;
  target: {
    localIp: string;
    localPort: number;
    protocol: 'http' | 'https' | 'tcp';
  };
  enabled?: boolean;
}

export interface PublicRouteProxyRule {
  name: string;
  type: 'tcp' | 'http';
  subdomain?: string;
  localIp: string;
  localPort: number;
  remotePort?: number;
  customDomains: string[];
  enabled: boolean;
  status:
    | 'active'
    | 'disabled'
    | 'failed'
    | 'port_conflict'
    | 'dns_missing'
    | 'upstream_unreachable';
  lastError?: string;
}

function normalizeHost(host: string | null | undefined): string {
  return (host ?? '').trim().toLowerCase().replace(/\.$/, '');
}

export function domainBelongsToSubdomainHost(
  domain: string,
  subdomainHost: string | null | undefined
): boolean {
  const normalizedDomain = normalizeHost(domain);
  const normalizedHost = normalizeHost(subdomainHost);
  if (!normalizedDomain || !normalizedHost) return false;
  return normalizedDomain === normalizedHost || normalizedDomain.endsWith(`.${normalizedHost}`);
}

export function buildPublicRouteProxyRule(
  route: PublicRouteProxySource,
  subdomainHost: string | null | undefined
): PublicRouteProxyRule {
  const type: 'tcp' | 'http' = route.target.protocol === 'tcp' ? 'tcp' : 'http';
  const useSubdomain = type === 'http' && domainBelongsToSubdomainHost(route.domain, subdomainHost);

  return {
    name: route.proxyRuleName,
    type,
    ...(useSubdomain ? { subdomain: route.slug } : {}),
    localIp: route.target.localIp,
    localPort: route.target.localPort,
    customDomains: type === 'http' && !useSubdomain ? [route.domain] : [],
    ...(type === 'tcp' ? { remotePort: Math.floor(Math.random() * 10000) + 9000 } : {}),
    enabled: route.enabled !== false,
    status: 'disabled',
  };
}

export function upsertPublicRouteProxyRule(
  proxyRules: PublicRouteProxyRule[],
  route: PublicRouteProxySource,
  subdomainHost: string | null | undefined
): boolean {
  const next = buildPublicRouteProxyRule(route, subdomainHost);
  const idx = proxyRules.findIndex((rule) => rule.name === next.name);
  if (idx === -1) {
    proxyRules.push(next);
    return true;
  }

  const current = proxyRules[idx];
  const merged: PublicRouteProxyRule = {
    ...current,
    ...next,
    remotePort: next.remotePort ?? current.remotePort,
    status: current.status === 'active' ? 'active' : next.status,
    lastError: current.lastError,
  };

  const changed =
    current.type !== merged.type ||
    current.subdomain !== merged.subdomain ||
    current.localIp !== merged.localIp ||
    current.localPort !== merged.localPort ||
    current.remotePort !== merged.remotePort ||
    current.enabled !== merged.enabled ||
    JSON.stringify(current.customDomains ?? []) !== JSON.stringify(merged.customDomains ?? []);

  if (changed) proxyRules[idx] = merged;
  return changed;
}
