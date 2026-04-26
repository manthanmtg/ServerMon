import { describe, expect, it } from 'vitest';
import {
  buildHubRouteDomain,
  domainBelongsToSubdomainHost,
  isValidPublicHostname,
  normalizeHostname,
  slugifyRouteName,
  validatePublicRouteDomain,
} from './domain';

describe('normalizeHostname', () => {
  it('trims whitespace, lowercases, and removes a trailing dot', () => {
    expect(normalizeHostname('  App.Example.COM.  ')).toBe('app.example.com');
  });
});

describe('slugifyRouteName', () => {
  it('turns mixed punctuation into a compact route slug', () => {
    expect(slugifyRouteName('  My API / v2: Admin  ')).toBe('my-api-v2-admin');
  });

  it('limits slugs to 80 characters', () => {
    expect(slugifyRouteName('a'.repeat(90))).toHaveLength(80);
  });
});

describe('isValidPublicHostname', () => {
  it('accepts multi-label hostnames with normalized casing and trailing dots', () => {
    expect(isValidPublicHostname('API.Example.COM.')).toBe(true);
  });

  it('rejects single-label hostnames, wildcards, and underscores', () => {
    expect(isValidPublicHostname('localhost')).toBe(false);
    expect(isValidPublicHostname('*.example.com')).toBe(false);
    expect(isValidPublicHostname('bad_name.example.com')).toBe(false);
  });

  it('rejects labels that start or end with a hyphen', () => {
    expect(isValidPublicHostname('-api.example.com')).toBe(false);
    expect(isValidPublicHostname('api-.example.com')).toBe(false);
  });
});

describe('domainBelongsToSubdomainHost', () => {
  it('matches the subdomain host itself and nested subdomains', () => {
    expect(domainBelongsToSubdomainHost('apps.example.com', 'example.com')).toBe(true);
    expect(domainBelongsToSubdomainHost('example.com', 'example.com')).toBe(true);
  });

  it('does not match suffix lookalikes or empty hosts', () => {
    expect(domainBelongsToSubdomainHost('badexample.com', 'example.com')).toBe(false);
    expect(domainBelongsToSubdomainHost('apps.example.com', '')).toBe(false);
  });
});

describe('buildHubRouteDomain', () => {
  it('combines a sanitized route slug with a normalized subdomain host', () => {
    expect(buildHubRouteDomain(' My API ', 'Example.COM.')).toBe('my-api.example.com');
  });

  it('returns an empty string when the slug or host normalizes empty', () => {
    expect(buildHubRouteDomain('!!!', 'example.com')).toBe('');
    expect(buildHubRouteDomain('api', '   ')).toBe('');
  });
});

describe('validatePublicRouteDomain', () => {
  it('returns null for a valid public route domain', () => {
    expect(
      validatePublicRouteDomain('app.example.com', {
        hubDomain: 'hub.example.com',
        subdomainHost: 'routes.example.com',
      })
    ).toBe(null);
  });

  it('returns a validation message for malformed hostnames', () => {
    expect(validatePublicRouteDomain('bad_name.example.com')).toContain('real hostname');
  });

  it('blocks the hub domain and the subdomain host itself', () => {
    expect(validatePublicRouteDomain('hub.example.com', { hubDomain: 'HUB.example.com.' })).toBe(
      'This domain is reserved for the ServerMon Hub. Use a subdomain instead.'
    );
    expect(
      validatePublicRouteDomain('routes.example.com', { subdomainHost: 'routes.example.com' })
    ).toBe('The FRP subdomain host itself cannot be exposed as a route. Use a subdomain instead.');
  });
});
