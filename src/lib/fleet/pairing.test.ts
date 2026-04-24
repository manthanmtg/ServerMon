import { describe, it, expect } from 'vitest';
import { generatePairingToken, hashPairingToken, verifyPairingToken } from './pairing';

describe('pairing tokens', () => {
  it('generates 40+ char tokens', () => {
    const t = generatePairingToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });
  it('hashes deterministically and verifies', async () => {
    const t = generatePairingToken();
    const h = await hashPairingToken(t);
    expect(h).not.toBe(t);
    expect(await verifyPairingToken(t, h)).toBe(true);
    expect(await verifyPairingToken('wrong', h)).toBe(false);
  });
});
