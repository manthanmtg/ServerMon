import { describe, it, expect } from 'vitest';
import { HeartbeatZodSchema } from './heartbeat';

const baseValid = {
  nodeId: 'node-1',
  bootId: 'boot-1',
  bootAt: new Date('2026-01-01T00:00:00.000Z'),
  agentVersion: '1.0.0',
  tunnel: {
    status: 'connected' as const,
  },
};

describe('HeartbeatZodSchema', () => {
  it('accepts minimal valid payload', () => {
    const parsed = HeartbeatZodSchema.parse(baseValid);
    expect(parsed.nodeId).toBe('node-1');
    expect(parsed.bootId).toBe('boot-1');
    expect(parsed.agentVersion).toBe('1.0.0');
    expect(parsed.tunnel.status).toBe('connected');
  });

  it('rejects missing nodeId', () => {
    const { nodeId: _nodeId, ...rest } = baseValid;
    expect(() => HeartbeatZodSchema.parse(rest)).toThrow();
  });

  it('rejects empty nodeId', () => {
    expect(() => HeartbeatZodSchema.parse({ ...baseValid, nodeId: '' })).toThrow();
  });

  it('rejects bad tunnel.status', () => {
    expect(() =>
      HeartbeatZodSchema.parse({
        ...baseValid,
        tunnel: { status: 'not-a-status' },
      })
    ).toThrow();
  });

  it('coerces bootAt from ISO string', () => {
    const parsed = HeartbeatZodSchema.parse({
      ...baseValid,
      bootAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.bootAt).toBeInstanceOf(Date);
    expect(parsed.bootAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('defaults to empty metrics, proxies, hardware, capabilities', () => {
    const parsed = HeartbeatZodSchema.parse(baseValid);
    expect(parsed.metrics).toEqual({});
    expect(parsed.proxies).toEqual([]);
    expect(parsed.hardware).toEqual({});
    expect(parsed.capabilities).toEqual({});
  });

  it('accepts full payload including hardware, metrics, proxies, capabilities', () => {
    const parsed = HeartbeatZodSchema.parse({
      ...baseValid,
      frpcVersion: '0.62.0',
      hardware: {
        cpuCount: 8,
        totalRam: 16_000_000_000,
        diskSize: 512_000_000_000,
        osDistro: 'Ubuntu 24.04',
        arch: 'x86_64',
      },
      metrics: {
        cpuLoad: 0.42,
        ramUsed: 4_000_000_000,
        uptime: 3600,
      },
      proxies: [
        { name: 'terminal', status: 'active' as const },
        { name: 'http', status: 'failed' as const, lastError: 'port busy' },
      ],
      capabilities: {
        terminal: true,
        metrics: true,
      },
      correlationId: 'corr-1',
    });
    expect(parsed.frpcVersion).toBe('0.62.0');
    expect(parsed.hardware.cpuCount).toBe(8);
    expect(parsed.metrics.cpuLoad).toBe(0.42);
    expect(parsed.proxies).toHaveLength(2);
    expect(parsed.capabilities.terminal).toBe(true);
    expect(parsed.correlationId).toBe('corr-1');
  });

  it('rejects invalid proxy status enum', () => {
    expect(() =>
      HeartbeatZodSchema.parse({
        ...baseValid,
        proxies: [{ name: 'x', status: 'not-a-proxy-status' }],
      })
    ).toThrow();
  });
});
