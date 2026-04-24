import { describe, it, expect, vi } from 'vitest';
import { evaluateAccess, type AccessPolicyData } from './access';

const noVerifyBasic = async () => false;
const noVerifyToken = async () => false;

function baseCtx(overrides: Partial<Parameters<typeof evaluateAccess>[1]> = {}) {
  return {
    clientIp: '10.0.0.1',
    now: new Date('2026-04-24T12:00:00Z'),
    ...overrides,
  };
}

describe('evaluateAccess: mode=disabled', () => {
  it('always denies', async () => {
    const p: AccessPolicyData = { mode: 'disabled' };
    const r = await evaluateAccess(p, baseCtx(), noVerifyBasic, noVerifyToken);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('route-disabled');
  });
});

describe('evaluateAccess: mode=public', () => {
  it('allows without any credentials', async () => {
    const p: AccessPolicyData = { mode: 'public' };
    const r = await evaluateAccess(p, baseCtx(), noVerifyBasic, noVerifyToken);
    expect(r.allowed).toBe(true);
  });

  it('still respects schedule windows when provided', async () => {
    // April 24, 2026 is a Friday (day 5). 12:00 UTC = 720 min.
    const within: AccessPolicyData = {
      mode: 'public',
      schedule: {
        windows: [{ daysOfWeek: [5], startMinute: 600, endMinute: 900 }],
      },
    };
    const outside: AccessPolicyData = {
      mode: 'public',
      schedule: {
        windows: [{ daysOfWeek: [5], startMinute: 0, endMinute: 60 }],
      },
    };
    const ra = await evaluateAccess(within, baseCtx(), noVerifyBasic, noVerifyToken);
    const rb = await evaluateAccess(outside, baseCtx(), noVerifyBasic, noVerifyToken);
    expect(ra.allowed).toBe(true);
    expect(rb.allowed).toBe(false);
    expect(rb.reason).toBe('schedule-denied');
  });

  it('ignores schedule if no windows defined', async () => {
    const p: AccessPolicyData = {
      mode: 'public',
      schedule: { windows: [] },
    };
    const r = await evaluateAccess(p, baseCtx(), noVerifyBasic, noVerifyToken);
    expect(r.allowed).toBe(true);
  });
});

describe('evaluateAccess: mode=servermon_auth', () => {
  it('allows when session is present', async () => {
    const p: AccessPolicyData = { mode: 'servermon_auth' };
    const r = await evaluateAccess(
      p,
      baseCtx({ session: { userId: 'u1' } }),
      noVerifyBasic,
      noVerifyToken
    );
    expect(r.allowed).toBe(true);
  });

  it('challenges session when missing', async () => {
    const p: AccessPolicyData = { mode: 'servermon_auth' };
    const r = await evaluateAccess(p, baseCtx(), noVerifyBasic, noVerifyToken);
    expect(r.allowed).toBe(false);
    expect(r.challenge).toBe('session');
  });

  it('denies when allowedUserRoles set and role mismatch', async () => {
    const p: AccessPolicyData = {
      mode: 'servermon_auth',
      allowedUserRoles: ['admin'],
    };
    const r = await evaluateAccess(
      p,
      baseCtx({ session: { userId: 'u1', role: 'viewer' } }),
      noVerifyBasic,
      noVerifyToken
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('role-denied');
  });

  it('allows when allowedUserRoles includes session role', async () => {
    const p: AccessPolicyData = {
      mode: 'servermon_auth',
      allowedUserRoles: ['admin'],
    };
    const r = await evaluateAccess(
      p,
      baseCtx({ session: { userId: 'u1', role: 'admin' } }),
      noVerifyBasic,
      noVerifyToken
    );
    expect(r.allowed).toBe(true);
  });
});

describe('evaluateAccess: mode=ip_allowlist', () => {
  it('allows exact IP match', async () => {
    const p: AccessPolicyData = {
      mode: 'ip_allowlist',
      ipAllowlist: ['10.0.0.1', '192.168.1.1'],
    };
    const r = await evaluateAccess(p, baseCtx(), noVerifyBasic, noVerifyToken);
    expect(r.allowed).toBe(true);
  });

  it('denies when IP not in list', async () => {
    const p: AccessPolicyData = {
      mode: 'ip_allowlist',
      ipAllowlist: ['192.168.1.1'],
    };
    const r = await evaluateAccess(p, baseCtx(), noVerifyBasic, noVerifyToken);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('ip-denied');
  });

  it('supports /24 CIDR match', async () => {
    const p: AccessPolicyData = {
      mode: 'ip_allowlist',
      ipAllowlist: ['10.0.0.0/24'],
    };
    const allow = await evaluateAccess(
      p,
      baseCtx({ clientIp: '10.0.0.55' }),
      noVerifyBasic,
      noVerifyToken
    );
    const deny = await evaluateAccess(
      p,
      baseCtx({ clientIp: '10.0.1.55' }),
      noVerifyBasic,
      noVerifyToken
    );
    expect(allow.allowed).toBe(true);
    expect(deny.allowed).toBe(false);
  });
});

describe('evaluateAccess: mode=basic_auth', () => {
  it('challenges when no basic auth header', async () => {
    const p: AccessPolicyData = {
      mode: 'basic_auth',
      basicAuth: [{ username: 'u', hashedPassword: 'hash' }],
    };
    const r = await evaluateAccess(p, baseCtx(), noVerifyBasic, noVerifyToken);
    expect(r.allowed).toBe(false);
    expect(r.challenge).toBe('basic_auth');
  });

  it('denies when password is wrong', async () => {
    const verify = vi.fn(async () => false);
    const p: AccessPolicyData = {
      mode: 'basic_auth',
      basicAuth: [{ username: 'u', hashedPassword: 'hash' }],
    };
    const header = 'Basic ' + Buffer.from('u:wrong').toString('base64');
    const r = await evaluateAccess(p, baseCtx({ basicAuthHeader: header }), verify, noVerifyToken);
    expect(r.allowed).toBe(false);
    expect(r.challenge).toBe('basic_auth');
    expect(verify).toHaveBeenCalledWith('u', 'wrong', 'hash');
  });

  it('allows when verify returns true for a matching entry', async () => {
    const verify = vi.fn(async (_user: string, pass: string) => pass === 'ok');
    const p: AccessPolicyData = {
      mode: 'basic_auth',
      basicAuth: [
        { username: 'bob', hashedPassword: 'bobhash' },
        { username: 'u', hashedPassword: 'hash' },
      ],
    };
    const header = 'Basic ' + Buffer.from('u:ok').toString('base64');
    const r = await evaluateAccess(p, baseCtx({ basicAuthHeader: header }), verify, noVerifyToken);
    expect(r.allowed).toBe(true);
  });

  it('denies when username not found', async () => {
    const verify = vi.fn(async () => true);
    const p: AccessPolicyData = {
      mode: 'basic_auth',
      basicAuth: [{ username: 'bob', hashedPassword: 'hash' }],
    };
    const header = 'Basic ' + Buffer.from('alice:ok').toString('base64');
    const r = await evaluateAccess(p, baseCtx({ basicAuthHeader: header }), verify, noVerifyToken);
    expect(r.allowed).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('evaluateAccess: mode=temporary_share', () => {
  it('denies when disabled', async () => {
    const p: AccessPolicyData = {
      mode: 'temporary_share',
      temporaryShare: { enabled: false },
    };
    const r = await evaluateAccess(p, baseCtx(), noVerifyBasic, noVerifyToken);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('temporary-share-disabled');
  });

  it('denies when expired', async () => {
    const p: AccessPolicyData = {
      mode: 'temporary_share',
      temporaryShare: {
        enabled: true,
        expiresAt: new Date('2026-04-23T00:00:00Z'),
        token: 'expected',
      },
    };
    const r = await evaluateAccess(
      p,
      baseCtx({ temporaryToken: 'expected' }),
      noVerifyBasic,
      async () => true
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('temporary-share-expired');
  });

  it('challenges when no token provided', async () => {
    const p: AccessPolicyData = {
      mode: 'temporary_share',
      temporaryShare: {
        enabled: true,
        token: 'expected',
        expiresAt: new Date('2026-05-01T00:00:00Z'),
      },
    };
    const r = await evaluateAccess(p, baseCtx(), noVerifyBasic, noVerifyToken);
    expect(r.allowed).toBe(false);
    expect(r.challenge).toBe('temporary_share');
  });

  it('allows when token matches and in allowedIps', async () => {
    const verify = vi.fn(async (a: string, b: string) => a === b);
    const p: AccessPolicyData = {
      mode: 'temporary_share',
      temporaryShare: {
        enabled: true,
        token: 'secret',
        expiresAt: new Date('2026-05-01T00:00:00Z'),
        allowedIps: ['10.0.0.1'],
      },
    };
    const r = await evaluateAccess(p, baseCtx({ temporaryToken: 'secret' }), noVerifyBasic, verify);
    expect(r.allowed).toBe(true);
  });

  it('denies when IP not in allowedIps', async () => {
    const verify = vi.fn(async (a: string, b: string) => a === b);
    const p: AccessPolicyData = {
      mode: 'temporary_share',
      temporaryShare: {
        enabled: true,
        token: 'secret',
        expiresAt: new Date('2026-05-01T00:00:00Z'),
        allowedIps: ['192.168.1.0/24'],
      },
    };
    const r = await evaluateAccess(
      p,
      baseCtx({ clientIp: '10.0.0.1', temporaryToken: 'secret' }),
      noVerifyBasic,
      verify
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('ip-denied');
  });

  it('denies when token verify returns false', async () => {
    const p: AccessPolicyData = {
      mode: 'temporary_share',
      temporaryShare: {
        enabled: true,
        token: 'secret',
        expiresAt: new Date('2026-05-01T00:00:00Z'),
      },
    };
    const r = await evaluateAccess(
      p,
      baseCtx({ temporaryToken: 'wrong' }),
      noVerifyBasic,
      async () => false
    );
    expect(r.allowed).toBe(false);
    expect(r.challenge).toBe('temporary_share');
  });
});
