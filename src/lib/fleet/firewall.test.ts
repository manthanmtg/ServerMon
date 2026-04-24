import { describe, it, expect, vi } from 'vitest';
import { checkInboundPort } from './firewall';

describe('checkInboundPort', () => {
  it('returns open=true when prober resolves true', async () => {
    const prober = vi.fn().mockResolvedValue(true);
    const r = await checkInboundPort({
      host: '1.2.3.4',
      port: 443,
      timeoutMs: 500,
      prober,
    });
    expect(r).toEqual({
      open: true,
      host: '1.2.3.4',
      port: 443,
      timeoutMs: 500,
    });
    expect(prober).toHaveBeenCalledWith('1.2.3.4', 443, 500);
  });

  it('returns open=false when prober resolves false', async () => {
    const prober = vi.fn().mockResolvedValue(false);
    const r = await checkInboundPort({
      host: 'example.com',
      port: 22,
      timeoutMs: 1000,
      prober,
    });
    expect(r.open).toBe(false);
    expect(r.host).toBe('example.com');
    expect(r.port).toBe(22);
    expect(r.timeoutMs).toBe(1000);
  });

  it('uses a default timeout when not provided', async () => {
    const prober = vi.fn().mockResolvedValue(true);
    const r = await checkInboundPort({
      host: '1.2.3.4',
      port: 443,
      prober,
    });
    expect(r.open).toBe(true);
    expect(typeof r.timeoutMs).toBe('number');
    expect(r.timeoutMs).toBeGreaterThan(0);
    const [, , timeoutArg] = prober.mock.calls[0];
    expect(timeoutArg).toBe(r.timeoutMs);
  });

  it('treats prober rejection as open=false', async () => {
    const prober = vi.fn().mockRejectedValue(new Error('timeout'));
    const r = await checkInboundPort({
      host: '1.2.3.4',
      port: 443,
      timeoutMs: 100,
      prober,
    });
    expect(r.open).toBe(false);
  });

  it('default prober: port 1 on 127.0.0.1 is closed', async () => {
    const r = await checkInboundPort({
      host: '127.0.0.1',
      port: 1,
      timeoutMs: 500,
    });
    expect(r.open).toBe(false);
    expect(r.host).toBe('127.0.0.1');
    expect(r.port).toBe(1);
    expect(r.timeoutMs).toBe(500);
  });
});
