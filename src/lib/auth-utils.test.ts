import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock argon2 before importing auth-utils
vi.mock('argon2', () => ({
  default: {
    hash: vi.fn(),
    verify: vi.fn(),
  },
}));

// Mock otplib before importing auth-utils
vi.mock('otplib', () => ({
  generateSecret: vi.fn(),
  generateURI: vi.fn(),
  verifySync: vi.fn(),
}));

// Mock qrcode (not under test, but imported by the module)
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(),
  },
}));

import argon2 from 'argon2';
import { generateSecret, verifySync } from 'otplib';
import {
  hashPassword,
  verifyPassword,
  generateTOTPSecret,
  verifyTOTPToken,
  generateQRCode,
} from './auth-utils';

const mockedArgon2 = vi.mocked(argon2);
const mockedGenerateSecret = vi.mocked(generateSecret);
const mockedVerifySync = vi.mocked(verifySync);

describe('auth-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should return the hashed password from argon2', async () => {
      mockedArgon2.hash.mockResolvedValue('$argon2id$hashed');

      const result = await hashPassword('my-password');

      expect(mockedArgon2.hash).toHaveBeenCalledOnce();
      expect(mockedArgon2.hash).toHaveBeenCalledWith('my-password');
      expect(result).toBe('$argon2id$hashed');
    });

    it('should propagate errors thrown by argon2.hash', async () => {
      mockedArgon2.hash.mockRejectedValue(new Error('hash failure'));

      await expect(hashPassword('any')).rejects.toThrow('hash failure');
    });
  });

  describe('verifyPassword', () => {
    it('should return true when argon2.verify resolves to true', async () => {
      mockedArgon2.verify.mockResolvedValue(true);

      const result = await verifyPassword('correct-password', '$argon2id$hashed');

      expect(mockedArgon2.verify).toHaveBeenCalledOnce();
      expect(mockedArgon2.verify).toHaveBeenCalledWith('$argon2id$hashed', 'correct-password');
      expect(result).toBe(true);
    });

    it('should return false when argon2.verify resolves to false', async () => {
      mockedArgon2.verify.mockResolvedValue(false);

      const result = await verifyPassword('wrong-password', '$argon2id$hashed');

      expect(result).toBe(false);
    });

    it('should return false (not throw) when argon2.verify rejects', async () => {
      mockedArgon2.verify.mockRejectedValue(new Error('invalid hash'));

      const result = await verifyPassword('any', 'bad-hash');

      expect(result).toBe(false);
    });
  });

  describe('generateTOTPSecret', () => {
    it('should return the secret produced by otplib generateSecret', () => {
      mockedGenerateSecret.mockReturnValue('JBSWY3DPEHPK3PXP');

      const result = generateTOTPSecret();

      expect(mockedGenerateSecret).toHaveBeenCalledOnce();
      expect(result).toBe('JBSWY3DPEHPK3PXP');
    });

    it('should return whatever string generateSecret returns', () => {
      mockedGenerateSecret.mockReturnValue('ANOTHERSECRET');

      expect(generateTOTPSecret()).toBe('ANOTHERSECRET');
    });
  });

  describe('verifyTOTPToken', () => {
    it('should return true when verifySync reports valid', () => {
      mockedVerifySync.mockReturnValue({ valid: true, delta: 0 });

      const result = verifyTOTPToken('123456', 'JBSWY3DPEHPK3PXP');

      expect(mockedVerifySync).toHaveBeenCalledOnce();
      expect(mockedVerifySync).toHaveBeenCalledWith({
        token: '123456',
        secret: 'JBSWY3DPEHPK3PXP',
      });
      expect(result).toBe(true);
    });

    it('should return false when verifySync reports invalid', () => {
      mockedVerifySync.mockReturnValue({ valid: false } as ReturnType<typeof mockedVerifySync>);

      const result = verifyTOTPToken('000000', 'JBSWY3DPEHPK3PXP');

      expect(result).toBe(false);
    });

    it('should pass through token and secret unchanged', () => {
      mockedVerifySync.mockReturnValue({ valid: true, delta: 0 });

      verifyTOTPToken('654321', 'MYSECRET');

      expect(mockedVerifySync).toHaveBeenCalledWith({ token: '654321', secret: 'MYSECRET' });
    });
  });

  describe('generateQRCode', () => {
    it('should generate a QR code data URL', async () => {
      const { generateURI } = await import('otplib');
      const qrcode = (await import('qrcode')).default;

      vi.mocked(generateURI).mockReturnValue(
        'otpauth://totp/ServerMon:test-user?secret=JBSWY3DPEHPK3PXP&issuer=ServerMon'
      );
      vi.mocked(qrcode.toDataURL).mockImplementation(async () => 'data:image/png;base64,mock');

      const result = await generateQRCode('test-user', 'JBSWY3DPEHPK3PXP');

      expect(generateURI).toHaveBeenCalledWith({
        issuer: 'ServerMon',
        label: 'test-user',
        secret: 'JBSWY3DPEHPK3PXP',
      });
      expect(qrcode.toDataURL).toHaveBeenCalledWith(
        'otpauth://totp/ServerMon:test-user?secret=JBSWY3DPEHPK3PXP&issuer=ServerMon'
      );
      expect(result).toBe('data:image/png;base64,mock');
    });

    it('should propagate errors from qrcode.toDataURL', async () => {
      const qrcode = (await import('qrcode')).default;
      vi.mocked(qrcode.toDataURL).mockRejectedValue(new Error('QR error'));

      await expect(generateQRCode('user', 'secret')).rejects.toThrow('QR error');
    });
  });
});
