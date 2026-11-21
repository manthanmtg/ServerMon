/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import type { FirewallSnapshot } from './types';

describe('FirewallSnapshot contract', () => {
  it('represents firewall posture, rules, checks, and summary metrics', () => {
    const snapshot: FirewallSnapshot = {
      timestamp: '2026-05-16T00:00:00.000Z',
      source: 'live',
      backend: 'ufw',
      available: true,
      enabled: true,
      defaultIncoming: 'deny',
      defaultOutgoing: 'allow',
      defaultRouted: 'disabled',
      rules: [
        {
          id: 'ufw-1',
          to: '22/tcp',
          action: 'limit',
          direction: 'in',
          from: 'Anywhere',
          protocol: 'tcp',
          port: '22',
          addressFamily: 'ipv4',
          raw: '22/tcp LIMIT IN Anywhere',
        },
      ],
      checks: [
        {
          id: 'firewall-active',
          title: 'Firewall is active',
          status: 'pass',
          severity: 'high',
          details: 'UFW is active.',
        },
      ],
      summary: {
        rulesCount: 1,
        allowCount: 0,
        denyCount: 0,
        rejectCount: 0,
        limitCount: 1,
        ipv6Rules: 0,
        exposedWellKnownCount: 0,
        healthScore: 100,
      },
    };

    expect(snapshot.backend).toBe('ufw');
    expect(snapshot.rules[0]?.action).toBe('limit');
    expect(snapshot.checks[0]?.status).toBe('pass');
    expect(snapshot.summary.healthScore).toBe(100);
  });
});
