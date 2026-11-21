import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@/lib/logger';
import type {
  FirewallAddressFamily,
  FirewallCheck,
  FirewallRule,
  FirewallRuleAction,
  FirewallRuleDirection,
  FirewallRuleProtocol,
  FirewallSnapshot,
} from '@/modules/firewall/types';

const execFileAsync = promisify(execFile);
const log = createLogger('firewall');

const SENSITIVE_PORTS = new Set(['22', '3306', '5432', '6379', '9200', '27017']);
const WELL_KNOWN_NAMES: Record<string, string> = {
  '22': 'SSH',
  '80': 'HTTP',
  '443': 'HTTPS',
  '3306': 'MySQL',
  '5432': 'PostgreSQL',
  '6379': 'Redis',
  '9200': 'Elasticsearch',
  '27017': 'MongoDB',
};

async function execCmd(cmd: string, args: string[], timeoutMs = 10000): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout;
  } catch (err: unknown) {
    const error = err as { stdout?: string };
    if (error.stdout) return error.stdout;
    throw err;
  }
}

function normalizeAction(value: string): FirewallRuleAction {
  const action = value.toLowerCase();
  if (action === 'allow' || action === 'deny' || action === 'reject' || action === 'limit') {
    return action;
  }
  return 'unknown';
}

function parseDirection(tokens: string[]): FirewallRuleDirection {
  if (tokens.includes('in')) return 'in';
  if (tokens.includes('out')) return 'out';
  return 'any';
}

function parseProtocol(to: string): FirewallRuleProtocol {
  const value = to.toLowerCase();
  if (value.includes('/tcp')) return 'tcp';
  if (value.includes('/udp')) return 'udp';
  return 'any';
}

function parsePort(to: string): string {
  const cleaned = to.replace(/\s+\(v6\)/i, '').trim();
  const portMatch = cleaned.match(/^(\d+(?::\d+)?(?:,\d+(?::\d+)?)?)/);
  return portMatch?.[1] || cleaned;
}

function parseAddressFamily(to: string, from: string): FirewallAddressFamily {
  const combined = `${to} ${from}`.toLowerCase();
  if (combined.includes('(v6)')) return 'ipv6';
  if (from.toLowerCase() === 'anywhere' || from.toLowerCase().includes('anywhere')) return 'ipv4';
  return 'any';
}

function isRuleLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^(status|logging|default|new profiles|to\s+action|--)/i.test(trimmed)) return false;
  return /\s{2,}/.test(trimmed) && /(allow|deny|reject|limit)/i.test(trimmed);
}

function parseUfwRule(line: string, index: number): FirewallRule | null {
  const parts = line.trim().split(/\s{2,}/);
  if (parts.length < 3) return null;

  const to = parts[0]?.trim() || '';
  const actionText = parts[1]?.trim().toLowerCase() || '';
  const from = parts.slice(2).join(' ').trim();
  const actionTokens = actionText.split(/\s+/);
  const action = normalizeAction(actionTokens[0] || '');

  return {
    id: `ufw-${index + 1}`,
    to,
    action,
    direction: parseDirection(actionTokens),
    from,
    protocol: parseProtocol(to),
    port: parsePort(to),
    addressFamily: parseAddressFamily(to, from),
    raw: line.trim(),
  };
}

function isGlobalSource(value: string): boolean {
  const source = value.toLowerCase();
  return source === 'anywhere' || source === 'anywhere (v6)' || source === 'any';
}

function isSensitiveGlobalAllow(rule: FirewallRule): boolean {
  return (
    rule.action === 'allow' &&
    (rule.direction === 'in' || rule.direction === 'any') &&
    isGlobalSource(rule.from) &&
    SENSITIVE_PORTS.has(rule.port)
  );
}

function summarizeRules(
  rules: FirewallRule[],
  enabled: boolean,
  available: boolean,
  incoming: string
) {
  const exposedWellKnownCount = rules.filter(isSensitiveGlobalAllow).length;
  let healthScore = 100;
  if (!available) healthScore -= 45;
  if (available && !enabled) healthScore -= 35;
  if (enabled && incoming && !['deny', 'reject'].includes(incoming.toLowerCase())) {
    healthScore -= 25;
  }
  healthScore -= exposedWellKnownCount * 12;

  return {
    rulesCount: rules.length,
    allowCount: rules.filter((rule) => rule.action === 'allow').length,
    denyCount: rules.filter((rule) => rule.action === 'deny').length,
    rejectCount: rules.filter((rule) => rule.action === 'reject').length,
    limitCount: rules.filter((rule) => rule.action === 'limit').length,
    ipv6Rules: rules.filter((rule) => rule.addressFamily === 'ipv6').length,
    exposedWellKnownCount,
    healthScore: Math.max(0, Math.min(100, healthScore)),
  };
}

export function buildFirewallChecks(snapshot: FirewallSnapshot): FirewallCheck[] {
  const checks: FirewallCheck[] = [];

  checks.push({
    id: 'firewall-active',
    title: 'Firewall is active',
    status: !snapshot.available ? 'warn' : snapshot.enabled ? 'pass' : 'fail',
    severity: 'high',
    details: !snapshot.available
      ? 'No supported firewall backend was detected.'
      : snapshot.enabled
        ? `${snapshot.backend.toUpperCase()} is active.`
        : `${snapshot.backend.toUpperCase()} is installed but inactive.`,
  });

  checks.push({
    id: 'default-incoming-policy',
    title: 'Default incoming policy is restrictive',
    status: ['deny', 'reject'].includes(snapshot.defaultIncoming.toLowerCase()) ? 'pass' : 'warn',
    severity: 'medium',
    details: snapshot.defaultIncoming
      ? `Incoming policy is ${snapshot.defaultIncoming}.`
      : 'Incoming policy could not be detected.',
  });

  const sensitiveRules = snapshot.rules.filter(isSensitiveGlobalAllow);
  if (sensitiveRules.length > 0) {
    checks.push({
      id: 'sensitive-port-exposure',
      title: 'Sensitive ports are not globally exposed',
      status: 'fail',
      severity: 'critical',
      details: sensitiveRules
        .map((rule) => WELL_KNOWN_NAMES[rule.port] || `port ${rule.port}`)
        .join(', '),
    });
  } else {
    checks.push({
      id: 'sensitive-port-exposure',
      title: 'Sensitive ports are not globally exposed',
      status: 'pass',
      severity: 'critical',
      details: 'No globally allowed SSH, database, cache, or search ports were detected.',
    });
  }

  checks.push({
    id: 'limited-rules-present',
    title: 'Rate-limited rules are used for exposed services',
    status: snapshot.summary.limitCount > 0 ? 'pass' : 'info',
    severity: 'low',
    details:
      snapshot.summary.limitCount > 0
        ? `${snapshot.summary.limitCount} rate-limited rule(s) detected.`
        : 'No UFW limit rules were detected.',
  });

  return checks;
}

export function parseUfwStatus(
  raw: string,
  timestamp = new Date().toISOString()
): FirewallSnapshot {
  const enabled = /status:\s*active/i.test(raw);
  const defaultMatch = raw.match(
    /Default:\s*([^,\s]+)\s*\(incoming\),\s*([^,\s]+)\s*\(outgoing\),\s*([^,\s]+)\s*\(routed\)/i
  );
  const rules = raw
    .split('\n')
    .filter(isRuleLine)
    .map(parseUfwRule)
    .filter((rule): rule is FirewallRule => Boolean(rule));

  const snapshot: FirewallSnapshot = {
    timestamp,
    source: 'live',
    backend: 'ufw',
    available: true,
    enabled,
    defaultIncoming: defaultMatch?.[1]?.toLowerCase() || '',
    defaultOutgoing: defaultMatch?.[2]?.toLowerCase() || '',
    defaultRouted: defaultMatch?.[3]?.toLowerCase() || '',
    rules,
    checks: [],
    summary: summarizeRules(rules, enabled, true, defaultMatch?.[1]?.toLowerCase() || ''),
  };
  snapshot.checks = buildFirewallChecks(snapshot);
  return snapshot;
}

function getMockSnapshot(): FirewallSnapshot {
  return parseUfwStatus(
    `Status: active
Default: deny (incoming), allow (outgoing), disabled (routed)

To                         Action      From
--                         ------      ----
22/tcp                     LIMIT IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
443/tcp (v6)               ALLOW IN    Anywhere (v6)
`,
    new Date().toISOString()
  );
}

function getUnavailableSnapshot(): FirewallSnapshot {
  const rules: FirewallRule[] = [];
  const snapshot: FirewallSnapshot = {
    timestamp: new Date().toISOString(),
    source: 'mock',
    backend: 'none',
    available: false,
    enabled: false,
    defaultIncoming: '',
    defaultOutgoing: '',
    defaultRouted: '',
    rules,
    checks: [],
    summary: summarizeRules(rules, false, false, ''),
  };
  snapshot.checks = buildFirewallChecks(snapshot);
  return snapshot;
}

async function getSnapshot(): Promise<FirewallSnapshot> {
  if (process.env.SERVERMON_FIREWALL_MOCK === '1') return getMockSnapshot();
  if (process.platform !== 'linux') return getUnavailableSnapshot();

  try {
    const raw = await execCmd('ufw', ['status', 'verbose']);
    return parseUfwStatus(raw);
  } catch (error) {
    log.warn('Failed to read UFW status', error);
    return getUnavailableSnapshot();
  }
}

export const firewallService = {
  getSnapshot,
};
