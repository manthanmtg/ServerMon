const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

export function slugifyRouteName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

export function isValidPublicHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized || normalized.length > 253) return false;
  if (normalized.includes('*') || normalized.includes('_')) return false;
  const labels = normalized.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) => HOSTNAME_RE.test(label));
}

export function domainBelongsToSubdomainHost(
  domain: string,
  subdomainHost: string | null | undefined
): boolean {
  const normalizedDomain = normalizeHostname(domain);
  const normalizedHost = normalizeHostname(subdomainHost ?? '');
  if (!normalizedDomain || !normalizedHost) return false;
  return normalizedDomain === normalizedHost || normalizedDomain.endsWith(`.${normalizedHost}`);
}

export function buildHubRouteDomain(
  slug: string,
  subdomainHost: string | null | undefined
): string {
  const normalizedSlug = slugifyRouteName(slug);
  const normalizedHost = normalizeHostname(subdomainHost ?? '');
  if (!normalizedSlug || !normalizedHost) return '';
  return `${normalizedSlug}.${normalizedHost}`;
}

export function validatePublicRouteDomain(
  domain: string,
  opts: { hubDomain?: string | null; subdomainHost?: string | null } = {}
): string | null {
  const normalized = normalizeHostname(domain);
  if (!isValidPublicHostname(normalized)) {
    return 'Use a real hostname like app.example.com. Wildcards, underscores, and single-label hosts are not supported.';
  }

  const hubDomain = normalizeHostname(opts.hubDomain ?? '');
  if (hubDomain && normalized === hubDomain) {
    return 'This domain is reserved for the ServerMon Hub. Use a subdomain instead.';
  }

  const subdomainHost = normalizeHostname(opts.subdomainHost ?? '');
  if (subdomainHost && normalized === subdomainHost) {
    return 'The FRP subdomain host itself cannot be exposed as a route. Use a subdomain instead.';
  }

  return null;
}
