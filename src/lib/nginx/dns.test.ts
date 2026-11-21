import { describe, expect, it, vi } from 'vitest';
import { buildDnsGuidance, checkNginxDns } from './dns';

describe('buildDnsGuidance', () => {
  it('builds direct host DNS records', () => {
    const guidance = buildDnsGuidance('app.example.com', '203.0.113.10');

    expect(guidance.recordName).toBe('app');
    expect(guidance.records).toContainEqual({
      type: 'A',
      name: 'app',
      value: '203.0.113.10',
    });
    expect(guidance.warnings).toEqual([]);
  });

  it('builds wildcard DNS records and apex warning', () => {
    const guidance = buildDnsGuidance('*.apps.example.com', '203.0.113.10');

    expect(guidance.recordName).toBe('*.apps');
    expect(guidance.sampleName).toBe('test.apps.example.com');
    expect(guidance.records).toContainEqual({
      type: 'A',
      name: '*.apps',
      value: '203.0.113.10',
    });
    expect(guidance.warnings).toContain(
      'Wildcard DNS does not cover apps.example.com; add a separate apex record if needed.'
    );
  });

  it('normalizes whitespace and uppercase domain patterns', () => {
    const guidance = buildDnsGuidance('  App.Example.COM  ', '203.0.113.10');

    expect(guidance.domainPattern).toBe('app.example.com');
    expect(guidance.lookupName).toBe('app.example.com');
    expect(guidance.recordName).toBe('app');
  });

  it('uses an apex record name for root domains', () => {
    const guidance = buildDnsGuidance('example.com', '203.0.113.10');

    expect(guidance.recordName).toBe('@');
    expect(guidance.records).toContainEqual({
      type: 'A',
      name: '@',
      value: '203.0.113.10',
    });
  });

  it('suggests AAAA records for IPv6 server addresses', () => {
    const guidance = buildDnsGuidance('app.example.com', '2001:db8::10');

    expect(guidance.records).toEqual([
      {
        type: 'AAAA',
        name: 'app',
        value: '2001:db8::10',
      },
    ]);
  });

  it('omits record suggestions when server IP is unavailable', () => {
    const guidance = buildDnsGuidance('app.example.com');

    expect(guidance.records).toEqual([]);
    expect(guidance.warnings).toEqual([]);
  });
});

describe('checkNginxDns', () => {
  it('resolves the sample name for wildcard hosts', async () => {
    const resolve4 = vi.fn(async () => ['203.0.113.10']);
    const result = await checkNginxDns('*.apps.example.com', {
      serverIp: '203.0.113.10',
      resolve4,
      resolve6: vi.fn(async () => []),
      resolveCname: vi.fn(async () => []),
    });

    expect(resolve4).toHaveBeenCalledWith('test.apps.example.com');
    expect(result.matchesServerIp).toBe(true);
    expect(result.resolved.a).toEqual(['203.0.113.10']);
  });

  it('treats resolver failures as empty result sets', async () => {
    const result = await checkNginxDns('app.example.com', {
      serverIp: '203.0.113.10',
      resolve4: vi.fn(async () => {
        throw new Error('not found');
      }),
      resolve6: vi.fn(async () => {
        throw new Error('no ipv6');
      }),
      resolveCname: vi.fn(async () => {
        throw new Error('no cname');
      }),
    });

    expect(result.resolved).toEqual({ a: [], aaaa: [], cname: [] });
    expect(result.matchesServerIp).toBe(false);
  });

  it('matches server IPs returned from AAAA lookups', async () => {
    const result = await checkNginxDns('app.example.com', {
      serverIp: '2001:db8::10',
      resolve4: vi.fn(async () => []),
      resolve6: vi.fn(async () => ['2001:db8::10']),
      resolveCname: vi.fn(async () => []),
    });

    expect(result.resolved.aaaa).toEqual(['2001:db8::10']);
    expect(result.matchesServerIp).toBe(true);
  });

  it('does not treat CNAME targets as direct server IP matches', async () => {
    const result = await checkNginxDns('app.example.com', {
      serverIp: '203.0.113.10',
      resolve4: vi.fn(async () => []),
      resolve6: vi.fn(async () => []),
      resolveCname: vi.fn(async () => ['server.example.com']),
    });

    expect(result.resolved.cname).toEqual(['server.example.com']);
    expect(result.matchesServerIp).toBe(false);
  });
});
