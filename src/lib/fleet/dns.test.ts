import { describe, it, expect, vi } from 'vitest';
import { resolveDomain, verifyExactRecord, verifyWildcard, type DnsResolver } from './dns';

function makeResolver(over: Partial<DnsResolver> = {}): DnsResolver {
  return {
    resolve4: async () => ['1.2.3.4'],
    resolveCname: async () => [],
    ...over,
  };
}

describe('resolveDomain', () => {
  it('returns ips and cname when resolver provides both', async () => {
    const resolver = makeResolver({
      resolve4: async () => ['1.2.3.4', '5.6.7.8'],
      resolveCname: async () => ['hub.example.com'],
    });
    const r = await resolveDomain('foo.example.com', resolver);
    expect(r.ips).toEqual(['1.2.3.4', '5.6.7.8']);
    expect(r.cname).toBe('hub.example.com');
  });

  it('returns empty ips when NOTFOUND is thrown', async () => {
    const notFound = Object.assign(new Error('not found'), {
      code: 'ENOTFOUND',
    });
    const resolver = makeResolver({
      resolve4: async () => {
        throw notFound;
      },
      resolveCname: async () => {
        throw notFound;
      },
    });
    const r = await resolveDomain('nothing.example.com', resolver);
    expect(r.ips).toEqual([]);
    expect(r.cname).toBeUndefined();
  });

  it('returns empty ips when resolver throws generic error', async () => {
    const resolver = makeResolver({
      resolve4: async () => {
        throw new Error('boom');
      },
      resolveCname: async () => {
        throw new Error('boom');
      },
    });
    const r = await resolveDomain('x.example.com', resolver);
    expect(r.ips).toEqual([]);
    expect(r.cname).toBeUndefined();
  });

  it('omits cname when resolveCname returns empty array', async () => {
    const resolver = makeResolver({
      resolve4: async () => ['1.2.3.4'],
      resolveCname: async () => [],
    });
    const r = await resolveDomain('foo.example.com', resolver);
    expect(r.cname).toBeUndefined();
  });

  it('works when resolveCname is absent', async () => {
    const resolver: DnsResolver = {
      resolve4: async () => ['1.2.3.4'],
    };
    const r = await resolveDomain('foo.example.com', resolver);
    expect(r.ips).toEqual(['1.2.3.4']);
    expect(r.cname).toBeUndefined();
  });
});

describe('verifyExactRecord', () => {
  it('returns match=true when IP is in the records', async () => {
    const resolver = makeResolver({
      resolve4: async () => ['9.9.9.9', '1.2.3.4'],
    });
    const r = await verifyExactRecord('x.example.com', '1.2.3.4', resolver);
    expect(r.match).toBe(true);
    expect(r.actual).toEqual(['9.9.9.9', '1.2.3.4']);
  });

  it('returns match=false when IP is not in the records', async () => {
    const resolver = makeResolver({
      resolve4: async () => ['9.9.9.9'],
    });
    const r = await verifyExactRecord('x.example.com', '1.2.3.4', resolver);
    expect(r.match).toBe(false);
    expect(r.actual).toEqual(['9.9.9.9']);
  });

  it('returns match=false when no records resolve', async () => {
    const resolver = makeResolver({
      resolve4: async () => {
        throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
      },
    });
    const r = await verifyExactRecord('x.example.com', '1.2.3.4', resolver);
    expect(r.match).toBe(false);
    expect(r.actual).toEqual([]);
  });
});

describe('verifyWildcard', () => {
  it('uses default probe subdomain __probe-fleet.<base>', async () => {
    const resolve4 = vi.fn().mockResolvedValue(['1.2.3.4']);
    const resolver = makeResolver({ resolve4 });
    const r = await verifyWildcard('example.com', '1.2.3.4', resolver);
    expect(r.sampledHost).toBe('__probe-fleet.example.com');
    expect(resolve4).toHaveBeenCalledWith('__probe-fleet.example.com');
    expect(r.match).toBe(true);
    expect(r.actual).toEqual(['1.2.3.4']);
  });

  it('uses provided sampleSubdomain', async () => {
    const resolve4 = vi.fn().mockResolvedValue(['5.6.7.8']);
    const resolver = makeResolver({ resolve4 });
    const r = await verifyWildcard('example.com', '1.2.3.4', resolver, 'canary');
    expect(r.sampledHost).toBe('canary.example.com');
    expect(resolve4).toHaveBeenCalledWith('canary.example.com');
    expect(r.match).toBe(false);
    expect(r.actual).toEqual(['5.6.7.8']);
  });

  it('returns match=false and empty actual when DNS fails', async () => {
    const resolver = makeResolver({
      resolve4: async () => {
        throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
      },
    });
    const r = await verifyWildcard('example.com', '1.2.3.4', resolver);
    expect(r.match).toBe(false);
    expect(r.actual).toEqual([]);
  });
});
