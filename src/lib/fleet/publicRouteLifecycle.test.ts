import { describe, expect, it, vi } from 'vitest';
import {
  ensureLetsEncryptCertificate,
  probePublicRoute,
  shouldUseLetsEncrypt,
} from './publicRouteLifecycle';

describe('shouldUseLetsEncrypt', () => {
  it('requires enabled TLS with letsencrypt provider', () => {
    expect(
      shouldUseLetsEncrypt({
        domain: 'app.example.com',
        enabled: true,
        tlsEnabled: true,
        tlsProvider: 'letsencrypt',
      })
    ).toBe(true);
    expect(
      shouldUseLetsEncrypt({
        domain: 'app.example.com',
        enabled: false,
        tlsEnabled: true,
        tlsProvider: 'letsencrypt',
      })
    ).toBe(false);
    expect(
      shouldUseLetsEncrypt({
        domain: 'app.example.com',
        enabled: true,
        tlsEnabled: true,
        tlsProvider: 'manual',
      })
    ).toBe(false);
  });
});

describe('ensureLetsEncryptCertificate', () => {
  it('bootstraps nginx and then requests a certificate', async () => {
    const nginx = {
      writeSnippet: vi.fn().mockResolvedValue('/etc/nginx/servermon/app.conf'),
      applyAndReload: vi.fn().mockResolvedValue({ ok: true, stderr: '' }),
    };
    const expiresAt = new Date('2026-07-24T00:00:00.000Z');
    const acmeProvider = {
      ensureCertificate: vi.fn().mockResolvedValue({
        certPath: '/etc/letsencrypt/live/app.example.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/app.example.com/privkey.pem',
        expiresAt,
      }),
      renewIfNeeded: vi.fn(),
      revoke: vi.fn(),
    };

    const result = await ensureLetsEncryptCertificate(
      { domain: 'app.example.com', slug: 'app', tlsEnabled: true, tlsProvider: 'letsencrypt' },
      { nginx, bootstrapSnippet: 'server { listen 80; }', acmeProvider }
    );

    expect(result.ok).toBe(true);
    expect(result.tlsStatus).toBe('active');
    expect(nginx.writeSnippet).toHaveBeenCalledWith('app', 'server { listen 80; }');
    expect(nginx.applyAndReload).toHaveBeenCalled();
    expect(acmeProvider.ensureCertificate).toHaveBeenCalledWith('app.example.com');
  });

  it('does not request a certificate when nginx bootstrap fails', async () => {
    const nginx = {
      writeSnippet: vi.fn().mockResolvedValue('/etc/nginx/servermon/app.conf'),
      applyAndReload: vi.fn().mockResolvedValue({ ok: false, stderr: 'bad nginx' }),
    };
    const acmeProvider = {
      ensureCertificate: vi.fn(),
      renewIfNeeded: vi.fn(),
      revoke: vi.fn(),
    };

    const result = await ensureLetsEncryptCertificate(
      { domain: 'app.example.com', slug: 'app', tlsEnabled: true, tlsProvider: 'letsencrypt' },
      { nginx, bootstrapSnippet: 'bad', acmeProvider }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('bad nginx');
    expect(acmeProvider.ensureCertificate).not.toHaveBeenCalled();
  });
});

describe('probePublicRoute', () => {
  it('marks a reachable HTTPS route active', async () => {
    const result = await probePublicRoute(
      { domain: 'app.example.com', tlsEnabled: true, tlsProvider: 'letsencrypt' },
      {
        resolveDomainImpl: vi.fn().mockResolvedValue({ ips: ['203.0.113.10'] }),
        fetchImpl: vi.fn().mockResolvedValue({ status: 302 }),
        now: () => new Date('2026-04-25T00:00:00.000Z'),
      }
    );

    expect(result).toMatchObject({
      status: 'active',
      dnsStatus: 'ok',
      tlsStatus: 'active',
      healthStatus: 'healthy',
    });
  });

  it('keeps unresolved DNS pending', async () => {
    const result = await probePublicRoute(
      { domain: 'missing.example.com', tlsEnabled: true, tlsProvider: 'letsencrypt' },
      {
        resolveDomainImpl: vi.fn().mockResolvedValue({ ips: [] }),
        fetchImpl: vi.fn(),
      }
    );

    expect(result.status).toBe('pending_dns');
    expect(result.dnsStatus).toBe('missing');
    expect(result.healthStatus).toBe('unknown');
  });

  it('marks TLS routes cert_failed when the public fetch fails', async () => {
    const result = await probePublicRoute(
      { domain: 'app.example.com', tlsEnabled: true, tlsProvider: 'letsencrypt' },
      {
        resolveDomainImpl: vi.fn().mockResolvedValue({ ips: ['203.0.113.10'] }),
        fetchImpl: vi.fn().mockRejectedValue(new Error('certificate verify failed')),
      }
    );

    expect(result.status).toBe('cert_failed');
    expect(result.tlsStatus).toBe('failed');
    expect(result.healthStatus).toBe('down');
  });
});
