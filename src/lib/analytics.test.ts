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
    // Must use a regular function (not arrow) so it can be called with `new`.
    const Ctor = vi.fn(function (this: { save: typeof mockSave }) {
        this.save = mockSave;
    }) as unknown as { find: typeof mockFind; new(): { save: typeof mockSave } };
    Ctor.find = mockFind;
    return { default: Ctor };
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

            await expect(
                analyticsService.track({ moduleId: 'm', event: 'e' })
            ).resolves.toBeUndefined();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[AnalyticsService]'),
                expect.any(Error)
            );
            consoleSpy.mockRestore();
        });

        it('does not throw when save fails', async () => {
            mockSave.mockRejectedValueOnce(new Error('Save failed'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(
                analyticsService.track({ moduleId: 'm', event: 'e' })
            ).resolves.toBeUndefined();

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

        it('passes the filter object to AnalyticsEvent.find', async () => {
            const filter = { moduleId: 'auth', severity: 'error' };
            await analyticsService.getRecentEvents(5, filter);

            expect(mockFind).toHaveBeenCalledWith(filter);
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
