import { describe, expect, it, vi } from 'vitest';
import { buildDnsGuidance, checkNginxDns } from './dns';

describe('buildDnsGuidance', () => {
  it('builds direct host DNS records', () => {
    const guidance = buildDnsGuidance('life.manthanby.cv', '203.0.113.10');

    expect(guidance.recordName).toBe('life');
    expect(guidance.records).toContainEqual({
      type: 'A',
      name: 'life',
      value: '203.0.113.10',
    });
    expect(guidance.warnings).toEqual([]);
  });

  it('builds wildcard DNS records and apex warning', () => {
    const guidance = buildDnsGuidance('*.ultron.manthanby.cv', '203.0.113.10');

    expect(guidance.recordName).toBe('*.ultron');
    expect(guidance.sampleName).toBe('test.ultron.manthanby.cv');
    expect(guidance.records).toContainEqual({
      type: 'A',
      name: '*.ultron',
      value: '203.0.113.10',
    });
    expect(guidance.warnings).toContain(
      'Wildcard DNS does not cover ultron.manthanby.cv; add a separate apex record if needed.'
    );
  });
});

describe('checkNginxDns', () => {
  it('resolves the sample name for wildcard hosts', async () => {
    const resolve4 = vi.fn(async () => ['203.0.113.10']);
    const result = await checkNginxDns('*.ultron.manthanby.cv', {
      serverIp: '203.0.113.10',
      resolve4,
      resolve6: vi.fn(async () => []),
      resolveCname: vi.fn(async () => []),
    });

    expect(resolve4).toHaveBeenCalledWith('test.ultron.manthanby.cv');
    expect(result.matchesServerIp).toBe(true);
    expect(result.resolved.a).toEqual(['203.0.113.10']);
  });
});
