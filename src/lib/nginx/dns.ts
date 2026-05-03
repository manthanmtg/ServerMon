import { resolve4, resolve6, resolveCname } from 'node:dns/promises';

export interface DnsRecordSuggestion {
  type: 'A' | 'AAAA' | 'CNAME';
  name: string;
  value: string;
}

export interface NginxDnsGuidance {
  domainPattern: string;
  lookupName: string;
  recordName: string;
  sampleName?: string;
  records: DnsRecordSuggestion[];
  warnings: string[];
}

export interface NginxDnsCheckResult extends NginxDnsGuidance {
  resolved: {
    a: string[];
    aaaa: string[];
    cname: string[];
  };
  matchesServerIp: boolean;
}

export interface NginxDnsCheckDeps {
  serverIp?: string;
  resolve4?: (hostname: string) => Promise<string[]>;
  resolve6?: (hostname: string) => Promise<string[]>;
  resolveCname?: (hostname: string) => Promise<string[]>;
}

function zoneRelativeName(hostname: string): string {
  const labels = hostname.split('.');
  if (labels.length <= 2) return '@';
  return labels.slice(0, -2).join('.');
}

function wildcardApex(domainPattern: string): string {
  return domainPattern.startsWith('*.') ? domainPattern.slice(2) : domainPattern;
}

export function buildDnsGuidance(domainPattern: string, serverIp?: string): NginxDnsGuidance {
  const normalized = domainPattern.trim().toLowerCase();
  const isWildcard = normalized.startsWith('*.');
  const lookupName = isWildcard ? normalized.replace('*.', 'test.') : normalized;
  const recordName = zoneRelativeName(normalized);
  const records: DnsRecordSuggestion[] = [];
  const warnings: string[] = [];

  if (serverIp) {
    records.push({
      type: serverIp.includes(':') ? 'AAAA' : 'A',
      name: recordName,
      value: serverIp,
    });
  }

  if (isWildcard) {
    warnings.push(
      `Wildcard DNS does not cover ${wildcardApex(normalized)}; add a separate apex record if needed.`
    );
  }

  return {
    domainPattern: normalized,
    lookupName,
    recordName,
    sampleName: isWildcard ? lookupName : undefined,
    records,
    warnings,
  };
}

async function resolveOrEmpty(resolver: (hostname: string) => Promise<string[]>, hostname: string) {
  try {
    return await resolver(hostname);
  } catch {
    return [];
  }
}

export async function checkNginxDns(
  domainPattern: string,
  deps: NginxDnsCheckDeps = {}
): Promise<NginxDnsCheckResult> {
  const guidance = buildDnsGuidance(domainPattern, deps.serverIp);
  const lookupName = guidance.lookupName;
  const a = await resolveOrEmpty(deps.resolve4 ?? resolve4, lookupName);
  const aaaa = await resolveOrEmpty(deps.resolve6 ?? resolve6, lookupName);
  const cname = await resolveOrEmpty(deps.resolveCname ?? resolveCname, lookupName);
  const all = [...a, ...aaaa];

  return {
    ...guidance,
    resolved: { a, aaaa, cname },
    matchesServerIp: deps.serverIp ? all.includes(deps.serverIp) : false,
  };
}
