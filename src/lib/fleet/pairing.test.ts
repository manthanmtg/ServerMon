import { describe, it, expect } from 'vitest';
import { generatePairingToken, hashPairingToken, verifyPairingToken } from './pairing';

describe('pairing tokens', () => {
  it('generates 40+ char tokens', () => {
    const t = generatePairingToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it('generates URL-safe tokens without padding', () => {
    const t = generatePairingToken();
    expect(t).not.toContain('+');
    expect(t).not.toContain('/');
    expect(t).not.toContain('=');
  });

  it('generates unique tokens across calls', () => {
    const tokens = Array.from({ length: 8 }, () => generatePairingToken());
    expect(new Set(tokens)).toHaveLength(tokens.length);
  });

  it('hashes a token and verifies the matching token', async () => {
    const t = generatePairingToken();
    const h = await hashPairingToken(t);
    expect(h).not.toBe(t);
    expect(await verifyPairingToken(t, h)).toBe(true);
    expect(await verifyPairingToken('wrong', h)).toBe(false);
  });

  it('creates salted hashes for the same token', async () => {
    const t = generatePairingToken();
    const first = await hashPairingToken(t);
    const second = await hashPairingToken(t);

    expect(first).not.toBe(second);
    expect(await verifyPairingToken(t, first)).toBe(true);
    expect(await verifyPairingToken(t, second)).toBe(true);
  });

  it('returns false for malformed hashes', async () => {
    await expect(verifyPairingToken('token', 'not-an-argon2-hash')).resolves.toBe(false);
  });

  it('returns false when the stored hash is empty', async () => {
    await expect(verifyPairingToken('token', '')).resolves.toBe(false);
  });
});
