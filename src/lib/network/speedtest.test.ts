/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
    createLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

vi.mock('child_process', () => ({
    spawn: vi.fn(),
}));

import { SpeedtestService } from './speedtest';
import { spawn } from 'child_process';

function getService(): SpeedtestService {
    return SpeedtestService.getInstance();
}

function resetService(isMock = true) {
    const service = getService();
    (service as unknown as { isMock: boolean }).isMock = isMock;
    (service as unknown as { isRunning: boolean }).isRunning = false;
    return service;
}

describe('SpeedtestService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        // Always reset state after each test
        resetService(true);
    });

    describe('getInstance()', () => {
        it('returns the same instance (singleton)', () => {
            const a = SpeedtestService.getInstance();
            const b = SpeedtestService.getInstance();
            expect(a).toBe(b);
        });
    });

    describe('runTest() — mock mode', () => {
        it('returns mock result', async () => {
            const service = resetService(true);
            const resultPromise = service.runTest();
            await vi.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.ping).toBe(12);
            expect(result.jitter).toBe(2);
            expect(result.speed).toBe(65.4);
            expect(result.isp).toBe('Mock ISP');
            expect(result.server).toBe('Mock Server');
            expect(result.location).toBe('San Francisco, CA');
        });

        it('emits progress events', async () => {
            const service = resetService(true);
            const progressTypes: string[] = [];
            const resultPromise = service.runTest((p) => progressTypes.push(p.type));
            await vi.runAllTimersAsync();
            await resultPromise;

            expect(progressTypes).toContain('ping');
            expect(progressTypes).toContain('download');
            expect(progressTypes).toContain('upload');
            expect(progressTypes).toContain('result');
        });

        it('includes final result in last progress event', async () => {
            const service = resetService(true);
            let finalProgress: { type: string; speed?: number; ping_ms?: number } | null = null;
            const resultPromise = service.runTest((p) => { finalProgress = p; });
            await vi.runAllTimersAsync();
            await resultPromise;

            expect(finalProgress).not.toBeNull();
            expect(finalProgress!.type).toBe('result');
            expect(typeof finalProgress!.speed).toBe('number');
            expect(typeof finalProgress!.ping_ms).toBe('number');
        });

        it('returns successfully without progress callback', async () => {
            const service = resetService(true);
            const resultPromise = service.runTest();
            await vi.runAllTimersAsync();
            const result = await resultPromise;
            expect(result.speed).toBeGreaterThan(0);
        });

        it('resets isRunning to false after completion', async () => {
            const service = resetService(true);
            const resultPromise = service.runTest();
            await vi.runAllTimersAsync();
            await resultPromise;
            expect((service as unknown as { isRunning: boolean }).isRunning).toBe(false);
        });
    });

    describe('runTest() — concurrent protection', () => {
        it('rejects if test is already running', async () => {
            const service = resetService(true);
            (service as unknown as { isRunning: boolean }).isRunning = true;

            await expect(service.runTest()).rejects.toThrow('Test already in progress');
        });

        it('emits error progress when already running', async () => {
            const service = resetService(true);
            (service as unknown as { isRunning: boolean }).isRunning = true;

            let errorProgress: { type: string; error?: string } | null = null;
            await service.runTest((p) => { errorProgress = p; }).catch(() => {});
            expect(errorProgress?.type).toBe('error');
            expect(errorProgress?.error).toContain('already in progress');
        });
    });

    describe('runTest() — system Ookla CLI', () => {
        it('resolves with parsed CLI result on success', async () => {
            vi.useRealTimers(); // Need real timers for this test
            const service = resetService(false);

            const resultJson = JSON.stringify({
                type: 'result',
                ping: { latency: 15.2, jitter: 1.8 },
                download: { bandwidth: 8000000 },
                isp: 'Test ISP',
                server: { name: 'Test Server', location: 'London, UK' },
            });

            let stdoutCallback: ((data: Buffer) => void) | null = null;
            let closeCallback: ((code: number) => void) | null = null;

            vi.mocked(spawn).mockReturnValue({
                stdout: {
                    on: vi.fn((event: string, cb: (data: Buffer) => void) => {
                        if (event === 'data') stdoutCallback = cb;
                    }),
                },
                stderr: { on: vi.fn() },
                on: vi.fn((event: string, cb: (code: number) => void) => {
                    if (event === 'close') closeCallback = cb;
                    if (event === 'error') { /* no-op */ }
                }),
            } as unknown as ReturnType<typeof spawn>);

            // Also make Ookla npm lib throw so we fall through to system CLI
            const _ooklaModule = { default: null };
            vi.doMock('speedtest-net', () => { throw new Error('not available'); });

            const testPromise = service.runTest();

            // Simulate CLI output
            await new Promise(r => setTimeout(r, 10));
            if (stdoutCallback) stdoutCallback(Buffer.from(resultJson + '\n'));
            if (closeCallback) closeCallback(0);

            const result = await testPromise;
            expect(result.ping).toBeCloseTo(15.2);
            expect(result.isp).toBe('Test ISP');
            expect(result.server).toBe('Test Server');
            expect(result.location).toBe('London, UK');
            // Speed: bandwidth * 8 / 1_000_000 = 8000000 * 8 / 1000000 = 64 Mbps
            expect(result.speed).toBeCloseTo(64);
        });
    });

    describe('download speed calculation', () => {
        it('mock result has valid speed in Mbps range', async () => {
            const service = resetService(true);
            const resultPromise = service.runTest();
            await vi.runAllTimersAsync();
            const result = await resultPromise;
            // Mock speed is 65.4 Mbps
            expect(result.speed).toBeGreaterThan(0);
            expect(result.speed).toBeLessThan(1000);
        });

        it('download progress events have speed property', async () => {
            const service = resetService(true);
            const downloadEvents: { type: string; speed?: number }[] = [];
            const resultPromise = service.runTest((p) => {
                if (p.type === 'download') downloadEvents.push(p);
            });
            await vi.runAllTimersAsync();
            await resultPromise;
            expect(downloadEvents.length).toBeGreaterThan(0);
            for (const ev of downloadEvents) {
                expect(typeof ev.speed).toBe('number');
            }
        });
    });
});
