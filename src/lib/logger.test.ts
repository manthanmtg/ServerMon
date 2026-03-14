import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Logger reads LOG_LEVEL at module load time, so we test with the default (info)
// by importing after the module is already loaded in the test environment.
import { createLogger } from './logger';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('should return a logger with all four methods', () => {
      const log = createLogger('test');
      expect(typeof log.debug).toBe('function');
      expect(typeof log.info).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.error).toBe('function');
    });

    it('should call console.info for info messages', () => {
      const log = createLogger('test-ctx');
      log.info('hello world');
      expect(console.info).toHaveBeenCalledOnce();
      const output = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(output).toContain('[INFO]');
      expect(output).toContain('[test-ctx]');
      expect(output).toContain('hello world');
    });

    it('should call console.warn for warn messages', () => {
      const log = createLogger('test-ctx');
      log.warn('something happened');
      expect(console.warn).toHaveBeenCalledOnce();
      const output = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(output).toContain('[WARN]');
      expect(output).toContain('something happened');
    });

    it('should call console.error for error messages', () => {
      const log = createLogger('test-ctx');
      log.error('it broke');
      expect(console.error).toHaveBeenCalledOnce();
      const output = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(output).toContain('[ERROR]');
      expect(output).toContain('it broke');
    });

    it('should include context in log output', () => {
      const log = createLogger('my-service');
      log.info('test message');
      const output = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(output).toContain('[my-service]');
    });

    it('should include ISO timestamp in log output', () => {
      const log = createLogger('test');
      log.info('timed');
      const output = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      // ISO 8601 pattern: e.g. 2026-03-14T12:00:00.000Z
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should serialize object data as JSON', () => {
      const log = createLogger('test');
      log.info('with data', { key: 'value', count: 42 });
      const output = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(output).toContain('"key"');
      expect(output).toContain('"value"');
    });

    it('should serialize Error data with message and stack', () => {
      const log = createLogger('test');
      const err = new Error('boom');
      log.error('caught error', err);
      const output = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(output).toContain('boom');
    });

    it('should not include extra data section when no data argument is passed', () => {
      const log = createLogger('test');
      log.info('plain message');
      const output = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      // Should end with the message (no trailing JSON or stack)
      expect(output.trim()).toMatch(/plain message$/);
    });
  });

  describe('LOG_LEVEL environment', () => {
    it('should respect LOG_LEVEL=warn', async () => {
      vi.stubEnv('LOG_LEVEL', 'warn');
      vi.resetModules();
      const { createLogger: createLoggerAtWarn } = await import('./logger');
      const log = createLoggerAtWarn('warn-test');
      
      log.info('should not show');
      log.warn('should show');
      
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      vi.unstubAllEnvs();
    });

    it('should allow debug logs when LOG_LEVEL is debug', async () => {
      vi.stubEnv('LOG_LEVEL', 'debug');
      vi.resetModules();
      const { createLogger } = await import('./logger');
      const logger = createLogger('test');
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      
      logger.debug('test debug');
      expect(debugSpy).toHaveBeenCalled();
      vi.unstubAllEnvs();
    });
  });
});
