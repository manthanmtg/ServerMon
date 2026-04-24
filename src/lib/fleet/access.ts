import type { AccessMode } from './enums';

export interface AccessRequestCtx {
  clientIp: string;
  basicAuthHeader?: string;
  session?: { userId: string; role?: string } | null;
  temporaryToken?: string;
  now: Date;
}

export interface AccessPolicyData {
  mode: AccessMode;
  ipAllowlist?: string[];
  basicAuth?: Array<{ username: string; hashedPassword: string }>;
  schedule?: {
    timezone?: string;
    windows: Array<{
      daysOfWeek: number[];
      startMinute: number;
      endMinute: number;
    }>;
  };
  temporaryShare?: {
    enabled: boolean;
    expiresAt?: Date;
    passwordHash?: string;
    allowedIps?: string[];
    token?: string;
  };
  allowedUserRoles?: string[];
}

export interface EvaluateResult {
  allowed: boolean;
  challenge?: 'basic_auth' | 'session' | 'temporary_share';
  reason?: string;
}

function ipToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = parseInt(p, 10);
    if (!Number.isFinite(x) || x < 0 || x > 255 || String(x) !== p) return null;
    n = (n << 8) + x;
  }
  return n >>> 0;
}

function ipMatches(clientIp: string, rule: string): boolean {
  const slashIdx = rule.indexOf('/');
  if (slashIdx === -1) {
    return clientIp === rule;
  }
  const base = rule.slice(0, slashIdx);
  const bits = parseInt(rule.slice(slashIdx + 1), 10);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const baseLong = ipToLong(base);
  const clientLong = ipToLong(clientIp);
  if (baseLong === null || clientLong === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (baseLong & mask) === (clientLong & mask);
}

function inSchedule(policy: AccessPolicyData, now: Date): { applied: boolean; allowed: boolean } {
  const windows = policy.schedule?.windows ?? [];
  if (windows.length === 0) return { applied: false, allowed: true };
  const dow = now.getUTCDay();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (const w of windows) {
    if (!w.daysOfWeek.includes(dow)) continue;
    if (minute >= w.startMinute && minute < w.endMinute) {
      return { applied: true, allowed: true };
    }
  }
  return { applied: true, allowed: false };
}

function parseBasicAuthHeader(header: string): { user: string; pass: string } | null {
  const m = /^Basic\s+(.+)$/.exec(header.trim());
  if (!m) return null;
  try {
    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function ipInList(clientIp: string, list: string[]): boolean {
  return list.some((rule) => ipMatches(clientIp, rule));
}

export async function evaluateAccess(
  policy: AccessPolicyData,
  ctx: AccessRequestCtx,
  verifyBasicAuth: (user: string, pass: string, hashed: string) => Promise<boolean>,
  verifyTemporaryToken: (provided: string, expected: string) => Promise<boolean>
): Promise<EvaluateResult> {
  if (policy.mode === 'disabled') {
    return { allowed: false, reason: 'route-disabled' };
  }

  // Schedule is a gating layer applied to every non-disabled mode.
  const sched = inSchedule(policy, ctx.now);
  if (sched.applied && !sched.allowed) {
    return { allowed: false, reason: 'schedule-denied' };
  }

  switch (policy.mode) {
    case 'public':
      return { allowed: true };

    case 'servermon_auth': {
      if (!ctx.session) {
        return { allowed: false, challenge: 'session' };
      }
      const allowedRoles = policy.allowedUserRoles ?? [];
      if (allowedRoles.length > 0) {
        if (!ctx.session.role || !allowedRoles.includes(ctx.session.role)) {
          return { allowed: false, reason: 'role-denied' };
        }
      }
      return { allowed: true };
    }

    case 'ip_allowlist': {
      const list = policy.ipAllowlist ?? [];
      if (!ipInList(ctx.clientIp, list)) {
        return { allowed: false, reason: 'ip-denied' };
      }
      return { allowed: true };
    }

    case 'basic_auth': {
      if (!ctx.basicAuthHeader) {
        return { allowed: false, challenge: 'basic_auth' };
      }
      const parsed = parseBasicAuthHeader(ctx.basicAuthHeader);
      if (!parsed) {
        return { allowed: false, challenge: 'basic_auth' };
      }
      const entries = policy.basicAuth ?? [];
      const entry = entries.find((e) => e.username === parsed.user);
      if (!entry) {
        return { allowed: false, challenge: 'basic_auth' };
      }
      const ok = await verifyBasicAuth(parsed.user, parsed.pass, entry.hashedPassword);
      if (!ok) {
        return { allowed: false, challenge: 'basic_auth' };
      }
      return { allowed: true };
    }

    case 'temporary_share': {
      const share = policy.temporaryShare;
      if (!share?.enabled) {
        return { allowed: false, reason: 'temporary-share-disabled' };
      }
      if (share.expiresAt && ctx.now > share.expiresAt) {
        return { allowed: false, reason: 'temporary-share-expired' };
      }
      if (share.allowedIps && share.allowedIps.length > 0) {
        if (!ipInList(ctx.clientIp, share.allowedIps)) {
          return { allowed: false, reason: 'ip-denied' };
        }
      }
      if (!ctx.temporaryToken) {
        return { allowed: false, challenge: 'temporary_share' };
      }
      const expected = share.token ?? '';
      const ok = await verifyTemporaryToken(ctx.temporaryToken, expected);
      if (!ok) {
        return { allowed: false, challenge: 'temporary_share' };
      }
      return { allowed: true };
    }
  }

  return { allowed: false, reason: 'unknown-mode' };
}
