/** @vitest-environment node */
import { describe, it, expect, vi, afterAll } from 'vitest';

// Mock systeminformation before the module is imported so the singleton
// constructor does not make real system calls.
vi.mock('systeminformation', () => ({
  default: {
    cpu: vi.fn().mockResolvedValue({ cores: 4 }),
    mem: vi.fn().mockResolvedValue({
      total: 8 * 1024 * 1024 * 1024,
      active: 2 * 1024 * 1024 * 1024,
      swaptotal: 0,
      swapused: 0,
      swapfree: 0,
    }),
    currentLoad: vi.fn().mockResolvedValue({ currentLoad: 20.0 }),
    time: vi.fn().mockResolvedValue({ uptime: 3600 }),
    fsSize: vi.fn().mockResolvedValue([]),
    fsStats: vi.fn().mockResolvedValue(null),
  },
}));

import { metricsService } from './metrics';

describe('MetricsService', () => {
  afterAll(() => {
    // Clean up the polling timer so the test process can exit cleanly.
    metricsService.shutdown();
  });

  // ── Connection management ─────────────────────────────────────────────────

  describe('registerConnection / unregisterConnection / getConnectionCount', () => {
    it('starts with zero active connections', () => {
      expect(metricsService.getConnectionCount()).toBe(0);
    });

    it('increments the count on registerConnection', () => {
      metricsService.registerConnection();
      expect(metricsService.getConnectionCount()).toBe(1);
      // cleanup
      metricsService.unregisterConnection();
    });

    it('decrements the count on unregisterConnection', () => {
      metricsService.registerConnection();
      metricsService.registerConnection();
      metricsService.unregisterConnection();
      expect(metricsService.getConnectionCount()).toBe(1);
      // cleanup
      metricsService.unregisterConnection();
    });

    it('does not go below zero on excess unregistrations', () => {
      // Ensure we start from zero
      while (metricsService.getConnectionCount() > 0) {
        metricsService.unregisterConnection();
      }
      metricsService.unregisterConnection();
      expect(metricsService.getConnectionCount()).toBe(0);
    });

    it('correctly tracks multiple sequential connections', () => {
      for (let i = 0; i < 5; i++) metricsService.registerConnection();
      expect(metricsService.getConnectionCount()).toBe(5);
      for (let i = 0; i < 5; i++) metricsService.unregisterConnection();
      expect(metricsService.getConnectionCount()).toBe(0);
    });
  });

  // ── canAcceptConnection ───────────────────────────────────────────────────

  describe('canAcceptConnection', () => {
    it('returns true when below the connection limit', () => {
      expect(metricsService.canAcceptConnection()).toBe(true);
    });

    it('returns false when the limit (20) is reached', () => {
      // Register 20 connections
      for (let i = 0; i < 20; i++) metricsService.registerConnection();
      expect(metricsService.canAcceptConnection()).toBe(false);
      // cleanup
      for (let i = 0; i < 20; i++) metricsService.unregisterConnection();
    });

    it('returns true again after connections are released', () => {
      metricsService.registerConnection();
      metricsService.unregisterConnection();
      expect(metricsService.canAcceptConnection()).toBe(true);
    });
  });

  // ── getCurrent / getHistory ───────────────────────────────────────────────

  describe('getCurrent', () => {
    it('returns null or a metric object (never throws)', () => {
      const current = metricsService.getCurrent();
      // Before the first poll resolves it may still be null; after it will be a metric.
      expect(current === null || typeof current === 'object').toBe(true);
    });
  });

  describe('getHistory', () => {
    it('returns an array (never throws)', () => {
      const history = metricsService.getHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('returns a defensive copy so callers cannot mutate internal state', () => {
      const h1 = metricsService.getHistory();
      const h2 = metricsService.getHistory();
      // They should be equal in content but not the same reference.
      expect(h1).toEqual(h2);
      expect(h1).not.toBe(h2);
    });
  });

  // ── shutdown ──────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('can be called without throwing', () => {
      expect(() => metricsService.shutdown()).not.toThrow();
    });

    it('can be called multiple times without throwing', () => {
      expect(() => {
        metricsService.shutdown();
        metricsService.shutdown();
      }).not.toThrow();
    });

    it('still allows reads after shutdown', () => {
      metricsService.shutdown();
      expect(() => metricsService.getCurrent()).not.toThrow();
      expect(() => metricsService.getHistory()).not.toThrow();
      expect(() => metricsService.getConnectionCount()).not.toThrow();
    });
  });
});
