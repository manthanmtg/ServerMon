/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Mock child_process and fs/promises
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:util')>();
  return {
    ...original,
    promisify: vi.fn((_fn) => {
      return async (...args: unknown[]) => {
        const { execFile } = await import('node:child_process');
        return new Promise((resolve, reject) => {
          const typedExecFile = execFile as unknown as (...a: unknown[]) => void;
          typedExecFile(...args, (err: Error | null, stdout: string) => {
            if (err) reject(err);
            else resolve({ stdout });
          });
        });
      };
    }),
  };
});

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  constants: { X_OK: 1 },
}));

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';

// Reset module between tests to clear certbot cache state
describe('certificatesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('getMockData / fallback behavior', () => {
    it('returns mock data when certbot is not available', async () => {
      // Make certbot detection fail
      vi.mocked(execFile).mockImplementation(
        // Paired explanation: using unknown[] and casting for mock implementation of child_process.execFile
        ((...args: unknown[]) => {
          const cb = args[args.length - 1] as (err: Error) => void;
          cb(new Error('not found'));
        }) as never
      );
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const { certificatesService } = await import('./service');
      const snapshot = await certificatesService.getSnapshot();

      expect(snapshot.source).toBe('mock');
      expect(snapshot.certbotAvailable).toBe(false);
      expect(snapshot.certificates).toHaveLength(3);
      expect(snapshot.summary.total).toBe(3);
    });

    it('mock data has correct expiry classifications', async () => {
      vi.mocked(execFile).mockImplementation(
        // Paired explanation: using unknown[] and casting for mock implementation of child_process.execFile
        ((...args: unknown[]) => {
          const cb = args[args.length - 1] as (err: Error) => void;
          cb(new Error('not found'));
        }) as never
      );
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const { certificatesService } = await import('./service');
      const snapshot = await certificatesService.getSnapshot();

      const expired = snapshot.certificates.filter((c) => c.isExpired);
      const expiringSoon = snapshot.certificates.filter((c) => c.isExpiringSoon);
      const valid = snapshot.certificates.filter((c) => !c.isExpired && !c.isExpiringSoon);

      expect(expired).toHaveLength(1);
      expect(expiringSoon).toHaveLength(1);
      expect(valid).toHaveLength(1);
    });
  });

  describe('renewCertificate', () => {
    it('returns success false and error message when certbot path is not initialized', async () => {
      // certbot not found, so certbotPath stays null
      vi.mocked(execFile).mockImplementation(
        // Paired explanation: using unknown[] and casting for mock implementation of child_process.execFile
        ((...args: unknown[]) => {
          const cb = args[args.length - 1] as (err: Error) => void;
          cb(new Error('not found'));
        }) as never
      );
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const { certificatesService } = await import('./service');
      // First call to getSnapshot sets certbotChecked=true with null path
      await certificatesService.getSnapshot();
      const result = await certificatesService.renewCertificate('example.com');
      expect(result.success).toBe(false);
      expect(result.output).toContain('certbot path not initialized');
    });
  });
});
