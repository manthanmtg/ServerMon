import { describe, it, expect } from 'vitest';
import { deriveNodeStatus, deriveNodeTransition, lastSeenLabel } from './status';

const now = new Date('2026-04-24T12:00:00Z');
describe('deriveNodeStatus', () => {
  it('returns unpaired when no token was ever verified', () => {
    expect(deriveNodeStatus({ unpaired: true, now })).toBe('unpaired');
  });
  it('returns disabled when node is disabled', () => {
    expect(deriveNodeStatus({ disabled: true, now })).toBe('disabled');
  });
  it('returns maintenance', () => {
    expect(deriveNodeStatus({ maintenanceEnabled: true, now })).toBe('maintenance');
  });
  it('returns offline when lastSeen > 60s old', () => {
    const lastSeen = new Date(now.getTime() - 90_000);
    expect(deriveNodeStatus({ lastSeen, tunnelStatus: 'disconnected', now })).toBe('offline');
  });
  it('returns degraded when tunnel reconnecting', () => {
    const lastSeen = new Date(now.getTime() - 5_000);
    expect(deriveNodeStatus({ lastSeen, tunnelStatus: 'reconnecting', now })).toBe('degraded');
  });
  it('returns online when fresh and connected', () => {
    const lastSeen = new Date(now.getTime() - 5_000);
    expect(deriveNodeStatus({ lastSeen, tunnelStatus: 'connected', now })).toBe('online');
  });
  it('lastSeenLabel formats human-readable', () => {
    expect(lastSeenLabel(new Date(now.getTime() - 30_000), now)).toMatch(/30s/);
    expect(lastSeenLabel(new Date(now.getTime() - 3_600_000), now)).toMatch(/1h/);
  });
});

describe('deriveNodeTransition', () => {
  it('returns null when lastBootAt is absent', () => {
    expect(
      deriveNodeTransition({
        tunnelStatus: 'connected',
        lastSeen: new Date(now.getTime() - 1_000),
        now,
      })
    ).toBe(null);
  });

  it('returns null when lastBootAt is older than 120s', () => {
    const lastBootAt = new Date(now.getTime() - 121_000);
    expect(
      deriveNodeTransition({
        lastBootAt,
        lastSeen: new Date(now.getTime() - 1_000),
        tunnelStatus: 'disconnected',
        now,
      })
    ).toBe(null);
  });

  it('returns "rebooting" when boot is recent but no heartbeat observed yet', () => {
    const lastBootAt = new Date(now.getTime() - 10_000);
    expect(
      deriveNodeTransition({
        lastBootAt,
        tunnelStatus: 'disconnected',
        now,
      })
    ).toBe('rebooting');
  });

  it('returns "rebooting" when lastSeen predates the reboot', () => {
    const lastBootAt = new Date(now.getTime() - 5_000);
    const lastSeen = new Date(lastBootAt.getTime() - 30_000);
    expect(
      deriveNodeTransition({
        lastBootAt,
        lastSeen,
        tunnelStatus: 'disconnected',
        now,
      })
    ).toBe('rebooting');
  });

  it('returns "starting_agent" when heartbeat present but tunnel is disconnected', () => {
    const lastBootAt = new Date(now.getTime() - 20_000);
    const lastSeen = new Date(now.getTime() - 2_000);
    expect(
      deriveNodeTransition({
        lastBootAt,
        lastSeen,
        tunnelStatus: 'disconnected',
        now,
      })
    ).toBe('starting_agent');
  });

  it('returns "reconnecting_tunnel" when tunnel is reconnecting after recent reboot', () => {
    const lastBootAt = new Date(now.getTime() - 20_000);
    const lastSeen = new Date(now.getTime() - 2_000);
    expect(
      deriveNodeTransition({
        lastBootAt,
        lastSeen,
        tunnelStatus: 'reconnecting',
        now,
      })
    ).toBe('reconnecting_tunnel');
  });

  it('returns "restoring_proxies" when tunnel is connected but enabled proxies not all active', () => {
    const lastBootAt = new Date(now.getTime() - 30_000);
    const lastSeen = new Date(now.getTime() - 1_000);
    expect(
      deriveNodeTransition({
        lastBootAt,
        lastSeen,
        tunnelStatus: 'connected',
        proxyRules: [
          { name: 'http', enabled: true, status: 'failed' },
          { name: 'ssh', enabled: false, status: 'disabled' },
        ] as never,
        now,
      })
    ).toBe('restoring_proxies');
  });

  it('returns null when tunnel is connected and all enabled proxies are active', () => {
    const lastBootAt = new Date(now.getTime() - 30_000);
    const lastSeen = new Date(now.getTime() - 1_000);
    expect(
      deriveNodeTransition({
        lastBootAt,
        lastSeen,
        tunnelStatus: 'connected',
        proxyRules: [
          { name: 'http', enabled: true, status: 'active' },
          { name: 'ssh', enabled: false, status: 'disabled' },
        ] as never,
        now,
      })
    ).toBe(null);
  });
});
