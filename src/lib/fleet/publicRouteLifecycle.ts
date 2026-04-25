import { CertbotProvider, type AcmeProvider, type CertificateInfo } from './acme';
import { resolveDomain as defaultResolveDomain } from './dns';

export interface PublicRouteLifecycleRoute {
  domain: string;
  path?: string;
  slug?: string;
  enabled?: boolean;
  tlsEnabled?: boolean;
  tlsProvider?: 'letsencrypt' | 'manual' | 'reverse_proxy';
}

export interface PublicRouteProbeStatus {
  status:
    | 'active'
    | 'disabled'
    | 'pending_dns'
    | 'cert_failed'
    | 'nginx_invalid'
    | 'nginx_reload_failed'
    | 'frp_unreachable'
    | 'upstream_down'
    | 'degraded';
  dnsStatus: 'ok' | 'missing' | 'mismatch' | 'unknown';
  tlsStatus: 'pending' | 'active' | 'failed' | 'expired' | 'unknown';
  healthStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  lastCheckedAt: Date;
  lastError?: string;
}

export interface EnsureCertificateResult {
  ok: boolean;
  tlsStatus: 'active' | 'failed' | 'unknown';
  certificate?: CertificateInfo;
  error?: string;
}

export interface NginxBootstrapper {
  writeSnippet: (slug: string, content: string) => Promise<string>;
  applyAndReload: () => Promise<{ ok: boolean; stderr: string }>;
}

export interface ProbePublicRouteOpts {
  resolveDomainImpl?: typeof defaultResolveDomain;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

export interface EnsureLetsEncryptOpts {
  nginx: NginxBootstrapper;
  bootstrapSnippet: string;
  acmeProvider?: AcmeProvider;
  email?: string;
  now?: () => Date;
}

function routeProbePath(routePath: string | undefined): string {
  if (!routePath || routePath === '/') return '/';
  return routePath.startsWith('/') ? routePath : `/${routePath}`;
}

function publicUrl(route: PublicRouteLifecycleRoute): string {
  const protocol = route.tlsEnabled === false ? 'http' : 'https';
  return `${protocol}://${route.domain}${routeProbePath(route.path)}`;
}

function responseIsReachable(status: number): boolean {
  return status > 0 && status < 500;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function shouldUseLetsEncrypt(route: PublicRouteLifecycleRoute): boolean {
  return (
    route.enabled !== false &&
    route.tlsEnabled !== false &&
    (route.tlsProvider === undefined || route.tlsProvider === 'letsencrypt')
  );
}

export async function ensureLetsEncryptCertificate(
  route: PublicRouteLifecycleRoute,
  opts: EnsureLetsEncryptOpts
): Promise<EnsureCertificateResult> {
  if (!route.slug) {
    return { ok: false, tlsStatus: 'failed', error: 'route slug is required for nginx bootstrap' };
  }

  const bootstrapReload = await opts.nginx
    .writeSnippet(route.slug, opts.bootstrapSnippet)
    .then(() => opts.nginx.applyAndReload());
  if (!bootstrapReload.ok) {
    return {
      ok: false,
      tlsStatus: 'failed',
      error: bootstrapReload.stderr || 'nginx bootstrap reload failed',
    };
  }

  const provider =
    opts.acmeProvider ??
    new CertbotProvider({
      email: opts.email || undefined,
      installer: 'nginx',
    });

  try {
    const certificate = await provider.ensureCertificate(route.domain);
    return { ok: true, tlsStatus: 'active', certificate };
  } catch (err) {
    return { ok: false, tlsStatus: 'failed', error: errorMessage(err) };
  }
}

export async function probePublicRoute(
  route: PublicRouteLifecycleRoute,
  opts: ProbePublicRouteOpts = {}
): Promise<PublicRouteProbeStatus> {
  const now = opts.now ?? (() => new Date());
  const checkedAt = now();
  if (route.enabled === false) {
    return {
      status: 'disabled',
      dnsStatus: 'unknown',
      tlsStatus: route.tlsEnabled === false ? 'unknown' : 'pending',
      healthStatus: 'unknown',
      lastCheckedAt: checkedAt,
    };
  }

  const resolveDomain = opts.resolveDomainImpl ?? defaultResolveDomain;
  try {
    const { ips } = await resolveDomain(route.domain);
    if (ips.length === 0) {
      return {
        status: 'pending_dns',
        dnsStatus: 'missing',
        tlsStatus: route.tlsEnabled === false ? 'unknown' : 'pending',
        healthStatus: 'unknown',
        lastCheckedAt: checkedAt,
        lastError: 'DNS did not resolve to any address',
      };
    }
  } catch (err) {
    return {
      status: 'pending_dns',
      dnsStatus: 'missing',
      tlsStatus: route.tlsEnabled === false ? 'unknown' : 'pending',
      healthStatus: 'unknown',
      lastCheckedAt: checkedAt,
      lastError: errorMessage(err),
    };
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    return {
      status: 'degraded',
      dnsStatus: 'ok',
      tlsStatus: route.tlsEnabled === false ? 'unknown' : 'unknown',
      healthStatus: 'unknown',
      lastCheckedAt: checkedAt,
      lastError: 'fetch is unavailable in this runtime',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await fetchImpl(publicUrl(route), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });
    const reachable = responseIsReachable(res.status);
    return {
      status: reachable ? 'active' : 'upstream_down',
      dnsStatus: 'ok',
      tlsStatus: route.tlsEnabled === false ? 'unknown' : 'active',
      healthStatus: reachable ? 'healthy' : 'down',
      lastCheckedAt: checkedAt,
      ...(reachable ? {} : { lastError: `Public probe returned HTTP ${res.status}` }),
    };
  } catch (err) {
    const message = errorMessage(err);
    const tlsStatus = route.tlsEnabled === false ? 'unknown' : 'failed';
    return {
      status: route.tlsEnabled === false ? 'upstream_down' : 'cert_failed',
      dnsStatus: 'ok',
      tlsStatus,
      healthStatus: 'down',
      lastCheckedAt: checkedAt,
      lastError: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
