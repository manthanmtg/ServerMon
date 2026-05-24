/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks so they can be referenced inside vi.mock factories
const { mockSave, mockLean, mockFind, mockConnectDB } = vi.hoisted(() => {
  const mockSave = vi.fn().mockResolvedValue(undefined);
  const mockLean = vi.fn().mockResolvedValue([]);
  const findChain = {
    sort: vi.fn(),
    limit: vi.fn(),
    lean: mockLean,
  };
  findChain.sort.mockReturnValue(findChain);
  findChain.limit.mockReturnValue(findChain);
  const mockFind = vi.fn().mockReturnValue(findChain);
  const mockConnectDB = vi.fn().mockResolvedValue(undefined);
  return { mockSave, mockLean, mockFind, mockConnectDB };
});

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));

vi.mock('@/models/AnalyticsEvent', () => {
  const MockAnalyticsEvent = vi.fn(function MockAnalyticsEvent(this: { save: typeof mockSave }) {
    this.save = mockSave;
  });

  MockAnalyticsEvent.find = mockFind;

  return { default: MockAnalyticsEvent };
});

import { analyticsService, AnalyticsService } from './analytics';
import connectDB from '@/lib/db';
import AnalyticsEvent from '@/models/AnalyticsEvent';

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLean.mockResolvedValue([]);
    mockSave.mockResolvedValue(undefined);
  });

  describe('getInstance', () => {
    it('returns the same instance on repeated calls', () => {
      const a = AnalyticsService.getInstance();
      const b = AnalyticsService.getInstance();
      expect(a).toBe(b);
    });

    it('returns the same singleton that is pre-exported', () => {
      expect(AnalyticsService.getInstance()).toBe(analyticsService);
    });
  });

  describe('track', () => {
    it('calls connectDB and saves a new analytics event with all fields', async () => {
      await analyticsService.track({
        moduleId: 'test-module',
        event: 'page_view',
        metadata: { path: '/dashboard' },
        severity: 'info',
      });

      expect(connectDB).toHaveBeenCalledOnce();
      expect(AnalyticsEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: 'test-module',
          event: 'page_view',
          metadata: { path: '/dashboard' },
          severity: 'info',
          timestamp: expect.any(Date),
        })
      );
      expect(mockSave).toHaveBeenCalledOnce();
    });

    it('tracks events with only required fields', async () => {
      await analyticsService.track({ moduleId: 'auth', event: 'login' });

      expect(AnalyticsEvent).toHaveBeenCalledWith(
        expect.objectContaining({ moduleId: 'auth', event: 'login' })
      );
      expect(mockSave).toHaveBeenCalledOnce();
    });

    it('omits metadata when it is not provided', async () => {
      await analyticsService.track({ moduleId: 'ui', event: 'page_view' });

      const eventArgs = vi.mocked(AnalyticsEvent).mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(eventArgs).toBeDefined();
      expect(eventArgs).not.toHaveProperty('metadata');
      expect(mockSave).toHaveBeenCalledOnce();
    });

    it('tracks repeated events by creating a new event instance each call', async () => {
      await analyticsService.track({ moduleId: 'flows', event: 'start' });
      await analyticsService.track({ moduleId: 'flows', event: 'stop' });

      expect(AnalyticsEvent).toHaveBeenCalledTimes(2);
      expect(mockSave).toHaveBeenCalledTimes(2);
    });

    it('attaches a timestamp to every tracked event', async () => {
      const before = new Date();
      await analyticsService.track({ moduleId: 'health', event: 'check' });
      const after = new Date();

      const callArg = vi.mocked(AnalyticsEvent).mock.calls[0][0] as { timestamp: Date };
      expect(callArg.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(callArg.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('does not throw when connectDB fails', async () => {
      mockConnectDB.mockRejectedValueOnce(new Error('DB down'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(analyticsService.track({ moduleId: 'm', event: 'e' })).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AnalyticsService]'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('does not throw when save fails', async () => {
      mockSave.mockRejectedValueOnce(new Error('Save failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(analyticsService.track({ moduleId: 'm', event: 'e' })).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('getRecentEvents', () => {
    it('returns events from the database', async () => {
      const mockEvents = [
        { moduleId: 'auth', event: 'login', timestamp: new Date() },
        { moduleId: 'docker', event: 'start', timestamp: new Date() },
      ];
      mockLean.mockResolvedValueOnce(mockEvents);

      const result = await analyticsService.getRecentEvents(10);

      expect(connectDB).toHaveBeenCalledOnce();
      expect(mockFind).toHaveBeenCalledWith({});
      expect(result).toEqual(mockEvents);
    });

    it('uses the default limit of 50 when not provided', async () => {
      await analyticsService.getRecentEvents();
      const chain = mockFind.mock.results[0]?.value as {
        sort: ReturnType<typeof vi.fn>;
        limit: ReturnType<typeof vi.fn>;
      };

      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(chain.sort).toHaveBeenCalledWith({ timestamp: -1 });
    });

    it('passes explicit limit to the query chain', async () => {
      await analyticsService.getRecentEvents(7);
      const chain = mockFind.mock.results[0]?.value as {
        sort: ReturnType<typeof vi.fn>;
        limit: ReturnType<typeof vi.fn>;
      };

      expect(chain.limit).toHaveBeenCalledWith(7);
    });

    it('passes the filter object to AnalyticsEvent.find', async () => {
      const filter = { moduleId: 'auth', severity: 'error' };
      await analyticsService.getRecentEvents(5, filter);

      expect(mockFind).toHaveBeenCalledWith(filter);
    });

    it('applies sort and limit before returning lean result', async () => {
      const mockEvents = [{ moduleId: 'db', event: 'connect' }];
      mockLean.mockResolvedValueOnce(mockEvents);
      await analyticsService.getRecentEvents(3, { moduleId: 'db' });

      const chain = mockFind.mock.results[0]?.value as {
        sort: ReturnType<typeof vi.fn>;
        limit: ReturnType<typeof vi.fn>;
        lean: ReturnType<typeof vi.fn>;
      };

      expect(chain.sort).toHaveBeenCalledOnce();
      expect(chain.limit).toHaveBeenCalledWith(3);
      expect(chain.lean).toHaveBeenCalledOnce();
      expect(mockFind).toHaveBeenCalledWith({ moduleId: 'db' });
      expect(chain.sort.mock.invocationCallOrder[0]).toBeLessThan(chain.limit.mock.invocationCallOrder[0]);
      expect(chain.limit.mock.invocationCallOrder[0]).toBeLessThan(chain.lean.mock.invocationCallOrder[0]);
    });

    it('uses an empty filter by default', async () => {
      await analyticsService.getRecentEvents();

      expect(mockFind).toHaveBeenCalledWith({});
    });

    it('returns an empty array when the DB query fails', async () => {
      mockLean.mockRejectedValueOnce(new Error('Query failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await analyticsService.getRecentEvents();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns an empty array when connectDB fails', async () => {
      mockConnectDB.mockRejectedValueOnce(new Error('DB down'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await analyticsService.getRecentEvents();

      expect(result).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('returns an empty array when no events match', async () => {
      mockLean.mockResolvedValueOnce([]);

      const result = await analyticsService.getRecentEvents(50, { moduleId: 'nonexistent' });

      expect(result).toEqual([]);
    });
  });
});
