/** @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('session-core', () => {
    const originalEnv = process.env.JWT_SECRET;
    const testSecret = 'test_secret_exactly_32_chars_now';

    beforeEach(() => {
        process.env.JWT_SECRET = testSecret;
        vi.stubEnv('NODE_ENV', 'test');
    });

    afterEach(() => {
        process.env.JWT_SECRET = originalEnv;
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('should encrypt a payload and return a non-empty JWT string', async () => {
        vi.resetModules();
        const { encrypt } = await import('./session-core');
        const token = await encrypt({ userId: '123' });
        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3);
    });

    it('should decrypt a token and recover the original payload', async () => {
        vi.resetModules();
        const { encrypt, decrypt } = await import('./session-core');
        const payload = { userId: 'abc' };
        const token = await encrypt(payload);
        const result = await decrypt(token);
        expect(result.userId).toBe('abc');
    });

    it('should reject a tampered token', async () => {
        vi.resetModules();
        const { encrypt, decrypt } = await import('./session-core');
        const token = await encrypt({ userId: '999' });
        const parts = token.split('.');
        parts[2] = parts[2].split('').reverse().join('');
        const tampered = parts.join('.');
        await expect(decrypt(tampered)).rejects.toThrow();
    });

    describe('getSecretKey', () => {
        it('should throw error in production when JWT_SECRET is missing', async () => {
            delete process.env.JWT_SECRET;
            vi.stubEnv('NODE_ENV', 'production');
            vi.resetModules();
            const { encrypt } = await import('./session-core');
            await expect(encrypt({ test: true })).rejects.toThrow('JWT_SECRET environment variable is required in production');
        });

        it('should warn in development when JWT_SECRET is missing', async () => {
            delete process.env.JWT_SECRET;
            vi.stubEnv('NODE_ENV', 'development');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            vi.resetModules();
            const { encrypt } = await import('./session-core');
            await encrypt({ test: true });
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Using insecure development fallback'));
        });
    });
});
