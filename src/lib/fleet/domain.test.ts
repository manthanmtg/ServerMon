import { describe, expect, it } from 'vitest';
import {
  buildHubRouteDomain,
  domainBelongsToSubdomainHost,
  normalizeHostname,
  slugifyRouteName,
  validatePublicRouteDomain,
} from './domain';

describe('fleet public route domain helpers', () => {
  it('normalizes hostnames and route names', () => {
    expect(normalizeHostname(' App.Example.COM. ')).toBe('app.example.com');
    expect(slugifyRouteName('Orion Test Route')).toBe('orion-test-route');
    expect(buildHubRouteDomain('Orion Test', 'Ultron.Manthanby.CV.')).toBe(
      'orion-test.ultron.manthanby.cv'
    );
  });

  it('detects domains managed by the FRP subdomain host', () => {
    expect(
      domainBelongsToSubdomainHost('orion-test.ultron.manthanby.cv', 'ultron.manthanby.cv')
    ).toBe(true);
    expect(domainBelongsToSubdomainHost('app.example.com', 'ultron.manthanby.cv')).toBe(false);
  });

  it('rejects unsafe or reserved public route domains', () => {
    expect(validatePublicRouteDomain('*.example.com')).toMatch(/hostname/i);
    expect(validatePublicRouteDomain('localhost')).toMatch(/hostname/i);
    expect(
      validatePublicRouteDomain('ultron.manthanby.cv', { hubDomain: 'ultron.manthanby.cv' })
    ).toMatch(/reserved/i);
    expect(
      validatePublicRouteDomain('ultron.manthanby.cv', {
        subdomainHost: 'ultron.manthanby.cv',
      })
    ).toMatch(/subdomain host/i);
  });
});
