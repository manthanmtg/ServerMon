/** @vitest-environment node */
import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from 'vitest';

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
import si from 'systeminformation';

function resetMetricsService() {
  const service = metricsService as unknown as {
    pollTimer: ReturnType<typeof setInterval> | null;
    initialized: boolean;
    history: unknown[];
    latest: unknown | null;
    activeConnections: number;
    removeAllListeners: (event: string) => void;
  };
  if (service.pollTimer) {
    clearInterval(service.pollTimer);
    service.pollTimer = null;
  }
  service.initialized = false;
  service.history = [];
  service.latest = null;
  service.activeConnections = 0;
  service.removeAllListeners('metric');
}

describe('MetricsService', () => {
  afterAll(() => {
    // Clean up the polling timer so the test process can exit cleanly.
    metricsService.shutdown();
  });

  // ── Polling and Event Emission ────────────────────────────────────────────

  describe('Polling and Event Emission', () => {
    const flushPromises = async () => {
      // Flush microtask queue enough times for the async poll to complete
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
    };

    beforeEach(() => {
      vi.useFakeTimers();
      resetMetricsService();
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.useRealTimers();
      resetMetricsService();
      vi.mocked(si.fsStats).mockResolvedValue(null as unknown as NonNullable<Awaited<ReturnType<typeof si.fsStats>>>);
    });

    it('initializes cpuCores and memTotal on first registerConnection', async () => {
      metricsService.registerConnection();
      await flushPromises();

      const current = metricsService.getCurrent();
      expect(current?.cpuCores).toBe(4);
      expect(current?.memTotal).toBe(8 * 1024 * 1024 * 1024);
    });

    it('emits metric event and updates current/history on successful poll', async () => {
      const listener = vi.fn();
      metricsService.on('metric', listener);

      metricsService.registerConnection();
      await flushPromises();

      expect(listener).toHaveBeenCalled();
      const current = metricsService.getCurrent();
      expect(current).not.toBeNull();
      expect(current?.cpu).toBe(20.0);
      expect(metricsService.getHistory().length).toBeGreaterThan(0);
    });

    it('maintains a maximum history of 120 items', async () => {
      metricsService.registerConnection();
      await flushPromises();

      // Fast forward many poll intervals (125 times)
      for (let i = 0; i < 125; i++) {
        await vi.advanceTimersByTimeAsync(2000);
        await flushPromises();
      }

      const history = metricsService.getHistory();
      expect(history.length).toBeLessThanOrEqual(120);
      expect(history.length).toBeGreaterThan(0);
    });

    it('handles null fsStats gracefully', async () => {
      vi.mocked(si.fsStats).mockResolvedValue(null as unknown as NonNullable<Awaited<ReturnType<typeof si.fsStats>>>);
      metricsService.registerConnection();
      await flushPromises();

      const current = metricsService.getCurrent();
      expect(current?.io).toBeNull();
    });

    it('maps fsStats when present', async () => {
      vi.mocked(si.fsStats).mockResolvedValue({ rx_sec: 100, wx_sec: 50 } as unknown as NonNullable<
        Awaited<ReturnType<typeof si.fsStats>>
      >);
      metricsService.registerConnection();
      await flushPromises();

      const current = metricsService.getCurrent();
      expect(current?.io).toEqual({
        r_sec: 100,
        w_sec: 50,
        t_sec: 150,
        r_wait: 0,
        w_wait: 0,
      });
    });

    it('does not map negative fsStats', async () => {
      vi.mocked(si.fsStats).mockResolvedValue({
        rx_sec: -10,
        wx_sec: -20,
      } as unknown as NonNullable<Awaited<ReturnType<typeof si.fsStats>>>);
      metricsService.registerConnection();
      await flushPromises();

      const current = metricsService.getCurrent();
      expect(current?.io).toEqual({
        r_sec: 0,
        w_sec: 0,
        t_sec: 0,
        r_wait: 0,
        w_wait: 0,
      });
    });

    it('does not crash if systeminformation throws during initialization', async () => {
      vi.mocked(si.cpu).mockRejectedValueOnce(new Error('init error'));
      metricsService.registerConnection();
      await flushPromises();

      const current = metricsService.getCurrent();
      expect(current).toBeDefined(); // Should still start polling and get a result
    });

    it('does not crash if systeminformation throws during polling loop', async () => {
      const listener = vi.fn();
      metricsService.on('metric', listener);

      vi.mocked(si.currentLoad).mockRejectedValueOnce(new Error('poll error'));
      metricsService.registerConnection();
      await flushPromises(); // first poll fails

      expect(listener).not.toHaveBeenCalled();
      expect(metricsService.getCurrent()).toBeNull();

      // Next interval should work
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();

      expect(listener).toHaveBeenCalled();
      expect(metricsService.getCurrent()).not.toBeNull();
    });
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
