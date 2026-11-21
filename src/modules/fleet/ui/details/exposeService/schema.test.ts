import { describe, expect, it } from 'vitest';
import { ExposeFormSchema, INITIAL_FORM, validateIdentity, validateTarget } from './schema';

describe('schema validateIdentity', () => {
  it('accepts a valid expose form identity payload', () => {
    const form = {
      ...INITIAL_FORM,
      name: 'My Service',
      slug: 'my-service',
      domain: 'app.example.com',
    };

    expect(validateIdentity(form)).toEqual({});
  });

  it('requires a non-empty name', () => {
    const form = {
      ...INITIAL_FORM,
      name: '   ',
      slug: 'my-service',
      domain: 'app.example.com',
    };

    expect(validateIdentity(form)).toEqual({ name: 'Name is required' });
  });

  it('requires a non-empty slug', () => {
    const form = {
      ...INITIAL_FORM,
      name: 'My Service',
      slug: '',
      domain: 'app.example.com',
    };

    expect(validateIdentity(form)).toEqual({ slug: 'Slug is required' });
  });

  it('flags bad slug formats', () => {
    const form = {
      ...INITIAL_FORM,
      name: 'My Service',
      slug: 'bad_slug',
      domain: 'app.example.com',
    };

    expect(validateIdentity(form)).toEqual({
      slug: 'Slug must be lowercase letters, numbers, and hyphens',
    });
  });

  it('requires a valid public domain', () => {
    const form = {
      ...INITIAL_FORM,
      name: 'My Service',
      slug: 'my-service',
      domain: 'localhost',
    };

    expect(validateIdentity(form)).toEqual({
      domain:
        'Use a hostname like app.example.com. Wildcards, underscores, and single-label hosts are not supported.',
    });
  });

  it('reports hostname validation errors for wildcard hosts', () => {
    const form = {
      ...INITIAL_FORM,
      name: 'My Service',
      slug: 'my-service',
      domain: '*.example.com',
    };

    expect(validateIdentity(form)).toEqual({
      domain:
        'Use a hostname like app.example.com. Wildcards, underscores, and single-label hosts are not supported.',
    });
  });
});

describe('schema validateTarget', () => {
  it('requires a node id', () => {
    const form = { ...INITIAL_FORM, proxyRuleName: 'web' };

    expect(validateTarget(form)).toEqual({ nodeId: 'Node is required' });
  });

  it('requires a proxy rule name', () => {
    const form = {
      ...INITIAL_FORM,
      nodeId: 'node-1',
      proxyRuleName: '   ',
    };

    expect(validateTarget(form)).toEqual({ proxyRuleName: 'Proxy rule is required' });
  });

  it('requires target ip and port when creating a new proxy rule', () => {
    const form = {
      ...INITIAL_FORM,
      nodeId: 'node-1',
      proxyRuleName: 'web',
      createNewProxyRule: true,
      target: { ...INITIAL_FORM.target, localIp: '', localPort: Number.NaN },
    };

    expect(validateTarget(form)).toEqual({
      target: 'Target IP and port are required',
    });
  });

  it('passes valid target form when not creating a new proxy rule', () => {
    const form = {
      ...INITIAL_FORM,
      nodeId: 'node-1',
      proxyRuleName: 'web',
      createNewProxyRule: false,
      target: { ...INITIAL_FORM.target, localPort: Number.NaN },
    };

    expect(validateTarget(form)).toEqual({});
  });
});

describe('schema ExposeFormSchema', () => {
  it('uses defaults for optional fields', () => {
    const parsed = ExposeFormSchema.parse({
      name: 'My Service',
      slug: 'my-service',
      domain: 'app.example.com',
      nodeId: 'node-1',
      proxyRuleName: 'web',
      target: {
        localIp: '127.0.0.1',
        localPort: 8080,
        protocol: 'http',
      },
    });

    expect(parsed.domainMode).toBe('hub_subdomain');
    expect(parsed.createNewProxyRule).toBe(false);
    expect(parsed.accessMode).toBe('servermon_auth');
    expect(parsed.timeoutSeconds).toBe(60);
    expect(parsed.maxBodyMb).toBe(32);
    expect(parsed.compression).toBe(true);
    expect(parsed.headers).toEqual({});
  });

  it('rejects ports outside the allowed range', () => {
    expect(() =>
      ExposeFormSchema.parse({
        name: 'My Service',
        slug: 'my-service',
        domain: 'app.example.com',
        nodeId: 'node-1',
        proxyRuleName: 'web',
        target: {
          localIp: '127.0.0.1',
          localPort: 99999,
          protocol: 'http',
        },
      })
    ).toThrow();
  });
});
