/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { buildFirewallChecks, parseUfwStatus } from './service';

const activeUfw = `Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
22/tcp                     LIMIT IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
5432/tcp                   ALLOW IN    10.0.0.0/8
443/tcp (v6)               ALLOW IN    Anywhere (v6)
`;

describe('parseUfwStatus', () => {
  it('parses active UFW defaults and rule posture', () => {
    const snapshot = parseUfwStatus(activeUfw, '2026-05-16T00:00:00.000Z');

    expect(snapshot.available).toBe(true);
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.defaultIncoming).toBe('deny');
    expect(snapshot.defaultOutgoing).toBe('allow');
    expect(snapshot.defaultRouted).toBe('disabled');
    expect(snapshot.summary.rulesCount).toBe(4);
    expect(snapshot.summary.allowCount).toBe(3);
    expect(snapshot.summary.limitCount).toBe(1);
    expect(snapshot.summary.ipv6Rules).toBe(1);
    expect(snapshot.rules[0]).toMatchObject({
      action: 'limit',
      direction: 'in',
      protocol: 'tcp',
      port: '22',
      from: 'Anywhere',
    });
  });

  it('flags globally exposed sensitive ports in checks', () => {
    const snapshot = parseUfwStatus(
      `Status: active
Default: deny (incoming), allow (outgoing), disabled (routed)

To                         Action      From
--                         ------      ----
6379/tcp                   ALLOW IN    Anywhere
`,
      '2026-05-16T00:00:00.000Z'
    );

    const checks = buildFirewallChecks(snapshot);
    expect(checks.some((check) => check.id === 'sensitive-port-exposure')).toBe(true);
    expect(checks.find((check) => check.id === 'sensitive-port-exposure')?.status).toBe('fail');
    expect(snapshot.summary.exposedWellKnownCount).toBe(1);
    expect(snapshot.summary.healthScore).toBeLessThan(90);
  });
});
