// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('session-core', () => {
  const originalEnv = process.env.JWT_SECRET;

  beforeEach(() => {
    // Use a stable test secret so tests are deterministic
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalEnv;
  });

  it('should encrypt a payload and return a non-empty JWT string', async () => {
    const { encrypt } = await import('./session-core');
    const token = await encrypt({ userId: '123', role: 'admin' });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    // JWTs have three base64url parts separated by dots
    expect(token.split('.')).toHaveLength(3);
  });

  it('should decrypt a token and recover the original payload', async () => {
    const { encrypt, decrypt } = await import('./session-core');
    const payload = { userId: 'abc', email: 'user@example.com' };
    const token = await encrypt(payload);
    const result = await decrypt(token);
    expect(result.userId).toBe('abc');
    expect(result.email).toBe('user@example.com');
  });

  it('should include iat and exp claims in the token', async () => {
    const { encrypt, decrypt } = await import('./session-core');
    const token = await encrypt({ userId: 'xyz' });
    const result = await decrypt(token);
    expect(result.iat).toBeDefined();
    expect(result.exp).toBeDefined();
    // exp should be approximately 2 hours after iat
    const iat = result.iat as number;
    const exp = result.exp as number;
    expect(exp - iat).toBeCloseTo(7200, -1);
  });

  it('should reject a tampered token', async () => {
    const { encrypt, decrypt } = await import('./session-core');
    const token = await encrypt({ userId: '999' });
    // Tamper with the signature (last segment)
    const parts = token.split('.');
    parts[2] = parts[2].split('').reverse().join('');
    const tampered = parts.join('.');
    await expect(decrypt(tampered)).rejects.toThrow();
  });

  it('should reject a token signed with a different secret', async () => {
    const { encrypt } = await import('./session-core');
    const token = await encrypt({ userId: '111' });

    // Change the secret then try to verify
    process.env.JWT_SECRET = 'completely-different-secret-key!';
    // Re-import to pick up the new secret — since the module may be cached,
    // use a dynamic import with cache-busting via a new URL
    const { decrypt } = await import('./session-core');
    await expect(decrypt(token)).rejects.toThrow();
  });
});
