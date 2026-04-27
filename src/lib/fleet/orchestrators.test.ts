import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFrpOrchestrator, getNginxOrchestrator, __setOrchestrators__ } from './orchestrators';
import { FrpOrchestrator } from './frpOrchestrator';
import { NginxOrchestrator } from './nginxOrchestrator';

// Mock models
vi.mock('@/models/FrpServerState', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock('@/models/NginxState', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: vi.fn() },
}));

// Mock orchestrators
vi.mock('./frpOrchestrator', () => {
  const Mock = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.applyRevision = vi.fn().mockResolvedValue(undefined);
    this.reconcileOnce = vi.fn().mockResolvedValue({ action: 'none' });
    return this;
  });
  return { FrpOrchestrator: Mock };
});

vi.mock('./nginxOrchestrator', () => {
  const Mock = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.writeSnippet = vi.fn().mockResolvedValue(undefined);
    this.removeSnippet = vi.fn().mockResolvedValue(undefined);
    this.applyAndReload = vi.fn().mockResolvedValue({ ok: true });
    return this;
  });
  return { NginxOrchestrator: Mock };
});

describe('fleet orchestrators', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    __setOrchestrators__(null, null);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getFrpOrchestrator', () => {
    it('should return a singleton instance of FrpOrchestrator', () => {
      const orch1 = getFrpOrchestrator();
      const orch2 = getFrpOrchestrator();

      expect(orch1).toBe(orch2);
      expect(FrpOrchestrator).toHaveBeenCalledTimes(1);
    });

    it('should use environment variables for FrpOrchestrator configuration', () => {
      process.env.FLEET_BINARY_CACHE_DIR = '/custom/cache';
      process.env.FLEET_FRPS_CONFIG_DIR = '/custom/config';
      process.env.FLEET_FRP_VERSION = '0.52.3';

      getFrpOrchestrator();

      expect(FrpOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({
          binaryCacheDir: '/custom/cache',
          configDir: '/custom/config',
          binaryVersion: '0.52.3',
        })
      );
    });

    it('should use default values for FrpOrchestrator if env vars are missing', () => {
      delete process.env.FLEET_BINARY_CACHE_DIR;
      delete process.env.FLEET_FRPS_CONFIG_DIR;
      delete process.env.FLEET_FRP_VERSION;

      getFrpOrchestrator();

      expect(FrpOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({
          binaryCacheDir: '/var/lib/servermon/frp-cache',
          configDir: '/etc/servermon/frp',
          binaryVersion: undefined,
        })
      );
    });

    it('should return a no-op orchestrator if construction fails', async () => {
      vi.mocked(FrpOrchestrator).mockImplementationOnce(() => {
        throw new Error('Construction failed');
      });

      const orch = getFrpOrchestrator();

      expect(orch.applyRevision).toBeDefined();
      expect(orch.reconcileOnce).toBeDefined();

      // Verify it doesn't throw when called
      await expect(orch.applyRevision('rendered', 'hash')).resolves.toBeUndefined();
      await expect(orch.reconcileOnce()).resolves.toEqual({ action: 'none' });
    });
  });

  describe('getNginxOrchestrator', () => {
    it('should return a singleton instance of NginxOrchestrator', () => {
      const orch1 = getNginxOrchestrator();
      const orch2 = getNginxOrchestrator();

      expect(orch1).toBe(orch2);
      expect(NginxOrchestrator).toHaveBeenCalledTimes(1);
    });

    it('should return an error-throwing orchestrator if construction fails', async () => {
      vi.mocked(NginxOrchestrator).mockImplementationOnce(() => {
        throw new Error('Construction failed');
      });

      const orch = getNginxOrchestrator();

      await expect(orch.writeSnippet('test', 'content')).rejects.toThrow(
        'nginx orchestrator unavailable'
      );
      await expect(orch.removeSnippet('test')).rejects.toThrow('nginx orchestrator unavailable');
      await expect(orch.applyAndReload()).resolves.toEqual({
        ok: false,
        stderr: 'nginx orchestrator unavailable',
      });
    });
  });

  describe('__setOrchestrators__', () => {
    it('should override singleton instances', () => {
      const mockFrp = { applyRevision: vi.fn(), reconcileOnce: vi.fn() };
      const mockNginx = { writeSnippet: vi.fn(), removeSnippet: vi.fn(), applyAndReload: vi.fn() };

      __setOrchestrators__(mockFrp, mockNginx);

      expect(getFrpOrchestrator()).toBe(mockFrp);
      expect(getNginxOrchestrator()).toBe(mockNginx);
      expect(FrpOrchestrator).not.toHaveBeenCalled();
      expect(NginxOrchestrator).not.toHaveBeenCalled();
    });

    it('should reset singletons when called with null', () => {
      getFrpOrchestrator();
      getNginxOrchestrator();

      expect(FrpOrchestrator).toHaveBeenCalledTimes(1);
      expect(NginxOrchestrator).toHaveBeenCalledTimes(1);

      __setOrchestrators__(null, null);

      getFrpOrchestrator();
      getNginxOrchestrator();

      expect(FrpOrchestrator).toHaveBeenCalledTimes(2);
      expect(NginxOrchestrator).toHaveBeenCalledTimes(2);
    });
  });
});
