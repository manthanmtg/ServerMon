import { promises as dnsPromises } from 'node:dns';

export interface DnsResolver {
  resolve4(host: string): Promise<string[]>;
  resolveCname?(host: string): Promise<string[]>;
}

const defaultResolver: DnsResolver = {
  resolve4: (host: string) => dnsPromises.resolve4(host),
  resolveCname: (host: string) => dnsPromises.resolveCname(host),
};

async function safeResolve4(resolver: DnsResolver, host: string): Promise<string[]> {
  try {
    return await resolver.resolve4(host);
  } catch {
    return [];
  }
}

async function safeResolveCname(resolver: DnsResolver, host: string): Promise<string[]> {
  if (!resolver.resolveCname) return [];
  try {
    return await resolver.resolveCname(host);
  } catch {
    return [];
  }
}

export async function resolveDomain(
  host: string,
  resolver: DnsResolver = defaultResolver
): Promise<{ ips: string[]; cname?: string }> {
  const [ips, cnames] = await Promise.all([
    safeResolve4(resolver, host),
    safeResolveCname(resolver, host),
  ]);
  const cname = cnames.length > 0 ? cnames[0] : undefined;
  return cname ? { ips, cname } : { ips };
}

export async function verifyExactRecord(
  host: string,
  expectedIp: string,
  resolver: DnsResolver = defaultResolver
): Promise<{ match: boolean; actual: string[] }> {
  const actual = await safeResolve4(resolver, host);
  return {
    match: actual.includes(expectedIp),
    actual,
  };
}

export async function verifyWildcard(
  baseDomain: string,
  expectedIp: string,
  resolver: DnsResolver = defaultResolver,
  sampleSubdomain?: string
): Promise<{ match: boolean; sampledHost: string; actual: string[] }> {
  const label = sampleSubdomain ?? '__probe-fleet';
  const sampledHost = `${label}.${baseDomain}`;
  const actual = await safeResolve4(resolver, sampledHost);
  return {
    match: actual.includes(expectedIp),
    sampledHost,
    actual,
  };
}
