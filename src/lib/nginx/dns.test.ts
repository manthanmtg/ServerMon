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
});
