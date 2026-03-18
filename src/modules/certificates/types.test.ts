/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type {
  CertificateInfo,
  CertbotCertificate,
  CertbotTimer,
  CertificatesSnapshot,
} from './types';

describe('certificates type shapes', () => {
  it('CertificateInfo can be constructed with all fields', () => {
    const cert: CertificateInfo = {
      domain: 'example.com',
      issuer: "Let's Encrypt",
      subject: 'CN=example.com',
      validFrom: '2026-01-01T00:00:00Z',
      validTo: '2026-04-01T00:00:00Z',
      daysUntilExpiry: 90,
      serialNumber: 'abc123',
      fingerprint: 'AA:BB:CC',
      sans: ['example.com', 'www.example.com'],
      algorithm: 'RSA',
      keySize: 2048,
      isExpired: false,
      isExpiringSoon: false,
      filePath: '/etc/letsencrypt/live/example.com/cert.pem',
      chainValid: true,
    };
    expect(cert.domain).toBe('example.com');
    expect(cert.daysUntilExpiry).toBe(90);
    expect(cert.isExpired).toBe(false);
    expect(cert.sans).toHaveLength(2);
  });

  it('CertificateInfo reflects expiry states correctly', () => {
    const expired: CertificateInfo = {
      domain: 'old.example.com',
      issuer: 'Self-signed',
      subject: 'CN=old.example.com',
      validFrom: '2024-01-01T00:00:00Z',
      validTo: '2024-04-01T00:00:00Z',
      daysUntilExpiry: -10,
      serialNumber: 'dead',
      fingerprint: '11:22:33',
      sans: [],
      algorithm: 'RSA',
      keySize: 2048,
      isExpired: true,
      isExpiringSoon: false,
      filePath: '/etc/ssl/old.pem',
      chainValid: false,
    };
    expect(expired.isExpired).toBe(true);
    expect(expired.daysUntilExpiry).toBeLessThan(0);
  });

  it('CertbotCertificate can be constructed', () => {
    const certbot: CertbotCertificate = {
      name: 'example.com',
      domains: ['example.com', 'www.example.com'],
      expiryDate: '2026-04-01T00:00:00Z',
      certPath: '/etc/letsencrypt/live/example.com/cert.pem',
      keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
      chainPath: '/etc/letsencrypt/live/example.com/chain.pem',
      daysUntilExpiry: 14,
      isExpired: false,
      isExpiringSoon: true,
    };
    expect(certbot.name).toBe('example.com');
    expect(certbot.isExpiringSoon).toBe(true);
    expect(certbot.domains).toHaveLength(2);
  });

  it('CertbotTimer tracks enabled and active states', () => {
    const timer: CertbotTimer = {
      enabled: true,
      lastRun: '2026-03-01T00:00:00Z',
      nextRun: '2026-03-15T00:00:00Z',
      active: true,
    };
    expect(timer.enabled).toBe(true);
    expect(timer.active).toBe(true);
  });

  it('CertificatesSnapshot wraps summary, certs, and metadata', () => {
    const snapshot: CertificatesSnapshot = {
      timestamp: '2026-03-18T00:00:00Z',
      source: 'live',
      certificates: [],
      certbotAvailable: true,
      certbotTimer: null,
      summary: {
        total: 3,
        valid: 2,
        expiringSoon: 1,
        expired: 0,
        nearestExpiry: 14,
        nearestDomain: 'example.com',
      },
    };
    expect(snapshot.source).toBe('live');
    expect(snapshot.summary.total).toBe(3);
    expect(snapshot.summary.expired).toBe(0);
    expect(snapshot.certbotTimer).toBeNull();
  });

  it('CertificatesSnapshot source can be mock', () => {
    const sources: CertificatesSnapshot['source'][] = ['live', 'mock'];
    expect(sources).toContain('live');
    expect(sources).toContain('mock');
  });
});
