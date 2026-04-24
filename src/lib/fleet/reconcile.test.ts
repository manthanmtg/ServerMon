import { describe, it, expect } from 'vitest';
import { runPostRebootReconcile } from './reconcile';

const now = new Date('2026-04-24T12:00:00Z');

describe('runPostRebootReconcile', () => {
  it('returns no gaps when lastSeen is fresh, tunnel connected and proxies healthy', () => {
    const report = runPostRebootReconcile({
      node: {
        lastSeen: new Date(now.getTime() - 5_000),
        tunnelStatus: 'connected',
        proxyRules: [
          { name: 'http', enabled: true, status: 'active' },
          { name: 'ssh', enabled: false, status: 'disabled' },
        ],
      },
      now,
    });
    expect(report.gaps).toEqual([]);
    expect(report.healthy).toBe(true);
    expect(report.checkedAt).toBe(now.toISOString());
  });

  it('flags stale heartbeat as an error', () => {
    const report = runPostRebootReconcile({
      node: {
        lastSeen: new Date(now.getTime() - 90_000),
        tunnelStatus: 'connected',
      },
      now,
    });
    const stale = report.gaps.find((g) => g.id === 'heartbeat_stale');
    expect(stale).toBeDefined();
    expect(stale?.severity).toBe('error');
    expect(report.healthy).toBe(false);
  });

  it('flags missing heartbeat as an error', () => {
    const report = runPostRebootReconcile({
      node: {
        tunnelStatus: 'connected',
      },
      now,
    });
    expect(report.gaps.find((g) => g.id === 'heartbeat_stale')?.severity).toBe('error');
    expect(report.healthy).toBe(false);
  });

  it('flags a disconnected tunnel as warn when reboot was recent', () => {
    const report = runPostRebootReconcile({
      node: {
        lastSeen: new Date(now.getTime() - 5_000),
        lastBootAt: new Date(now.getTime() - 30_000),
        tunnelStatus: 'disconnected',
      },
      now,
    });
    const g = report.gaps.find((x) => x.id === 'tunnel_disconnected');
    expect(g?.severity).toBe('warn');
  });

  it('flags a disconnected tunnel as error when reboot is older than 2 minutes', () => {
    const report = runPostRebootReconcile({
      node: {
        lastSeen: new Date(now.getTime() - 5_000),
        lastBootAt: new Date(now.getTime() - 10 * 60_000),
        tunnelStatus: 'reconnecting',
      },
      now,
    });
    const g = report.gaps.find((x) => x.id === 'tunnel_disconnected');
    expect(g?.severity).toBe('error');
  });

  it('flags each enabled proxy whose status is not active with warn severity', () => {
    const report = runPostRebootReconcile({
      node: {
        lastSeen: new Date(now.getTime() - 5_000),
        tunnelStatus: 'connected',
        proxyRules: [
          { name: 'http', enabled: true, status: 'failed', lastError: 'bind: port 80' },
          { name: 'ssh', enabled: true, status: 'port_conflict' },
          { name: 'db', enabled: false, status: 'disabled' },
          { name: 'ok', enabled: true, status: 'active' },
        ],
      },
      now,
    });
    const ids = report.gaps.map((g) => g.id);
    expect(ids).toContain('proxy_not_active:http');
    expect(ids).toContain('proxy_not_active:ssh');
    expect(ids).not.toContain('proxy_not_active:db');
    expect(ids).not.toContain('proxy_not_active:ok');
    expect(
      report.gaps.every((g) => (g.id.startsWith('proxy_not_active') ? g.severity === 'warn' : true))
    ).toBe(true);
    const httpGap = report.gaps.find((g) => g.id === 'proxy_not_active:http');
    expect(httpGap?.detail).toContain('bind: port 80');
  });

  it('collects multiple gaps simultaneously', () => {
    const report = runPostRebootReconcile({
      node: {
        tunnelStatus: 'disconnected',
        proxyRules: [{ name: 'http', enabled: true, status: 'failed' }],
      },
      now,
    });
    expect(report.gaps.length).toBeGreaterThanOrEqual(3);
    expect(report.healthy).toBe(false);
  });

  it('accepts ISO string dates in input', () => {
    const report = runPostRebootReconcile({
      node: {
        lastSeen: new Date(now.getTime() - 5_000).toISOString(),
        tunnelStatus: 'connected',
      },
      now,
    });
    expect(report.healthy).toBe(true);
  });
});
