import { createLogger } from '@/lib/logger';

const log = createLogger('speedtest');

export interface SpeedtestProgress {
    type: 'ping' | 'download' | 'upload' | 'result' | 'error';
    progress: number; // 0 to 1
    speed?: number; // bytes per second
    ping_ms?: number;
    jitter?: number;
    isp?: string;
    server?: string;
    location?: string;
    error?: string;
}

export interface SpeedtestResult {
    ping: number;
    jitter: number;
    speed: number; // Download speed in Mbps
    isp: string;
    server: string;
    location: string;
}

// Lazy load speedtest-net to avoid build-time issues with native modules
async function getSpeedTest() {
    try {
        const mod = await import('speedtest-net');
        return mod.default;
    } catch (error) {
        log.error('Failed to load speedtest-net:', error);
        return null;
    }
}

export class SpeedtestService {
    private static instance: SpeedtestService;
    private isMock = process.env.SPEEDTEST_MOCK === 'true' || process.env.NEXT_RUNTIME === 'edge';
    private isRunning = false;

    private constructor() { }

    public static getInstance(): SpeedtestService {
        if (!SpeedtestService.instance) {
            SpeedtestService.instance = new SpeedtestService();
        }
        return SpeedtestService.instance;
    }

    public async runTest(onProgress?: (progress: SpeedtestProgress) => void): Promise<SpeedtestResult> {
        if (this.isRunning) {
            onProgress?.({ type: 'error', progress: 0, error: 'Test already in progress' });
            throw new Error('Test already in progress');
        }

        this.isRunning = true;

        try {
            if (this.isMock) {
                return await this.runMockTest(onProgress);
            }

            const speedTest = await getSpeedTest();
            if (!speedTest) {
                log.warn('speedtest-net not available, falling back to mock');
                return await this.runMockTest(onProgress);
            }

            log.info('Starting speedtest-net...');
            const result = await speedTest({
                acceptLicense: true,
                acceptGdpr: true,
                progress: (progress: unknown) => {
                    const data = progress as { type: string; progress: number; download?: { bandwidth: number }; upload?: { bandwidth: number } };
                    if (data.type === 'ping') {
                        onProgress?.({ type: 'ping', progress: data.progress });
                    } else if (data.type === 'download') {
                        onProgress?.({
                            type: 'download',
                            progress: data.progress,
                            speed: (data.download?.bandwidth ?? 0) * 8
                        });
                    } else if (data.type === 'upload') {
                        onProgress?.({
                            type: 'upload',
                            progress: data.progress,
                            speed: (data.upload?.bandwidth ?? 0) * 8
                        });
                    }
                }
            });

            const res = result as {
                ping?: { latency: number; jitter: number };
                download?: { bandwidth: number };
                isp?: string;
                server?: { name: string; location: string };
            };

            const finalResult: SpeedtestResult = {
                ping: res.ping?.latency ?? 0,
                jitter: res.ping?.jitter ?? 0,
                speed: (res.download?.bandwidth ?? 0) * 8 / 1_000_000, // Mbps
                isp: res.isp ?? 'Unknown',
                server: res.server?.name ?? 'Unknown',
                location: res.server?.location ?? 'Unknown'
            };

            // Send final result event
            onProgress?.({
                type: 'result',
                progress: 1,
                speed: finalResult.speed * 1_000_000 / 8, // Back to bytes/s for consistency? or just Mbps
                ping_ms: finalResult.ping,
                jitter: finalResult.jitter,
                isp: finalResult.isp,
                server: finalResult.server,
                location: finalResult.location
            });

            return finalResult;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error('Speedtest failed:', message);
            onProgress?.({ type: 'error', progress: 0, error: message });
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    private async runMockTest(onProgress?: (progress: SpeedtestProgress) => void): Promise<SpeedtestResult> {
        log.info('Running mock speedtest...');
        
        // Ping
        onProgress?.({ type: 'ping', progress: 0.5 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Download
        for (let i = 0; i <= 10; i++) {
            onProgress?.({
                type: 'download',
                progress: i / 10,
                speed: (50 + Math.random() * 20) * 1_000_000 / 8 // Mock 50-70 Mbps
            });
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // Upload
        for (let i = 0; i <= 10; i++) {
            onProgress?.({
                type: 'upload',
                progress: i / 10,
                speed: (20 + Math.random() * 10) * 1_000_000 / 8 // Mock 20-30 Mbps
            });
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        const result: SpeedtestResult = {
            ping: 12,
            jitter: 2,
            speed: 65.4,
            isp: 'Mock ISP',
            server: 'Mock Server',
            location: 'San Francisco, CA'
        };

        onProgress?.({
            type: 'result',
            progress: 1,
            speed: result.speed * 1_000_000 / 8,
            ping_ms: result.ping,
            jitter: result.jitter,
            isp: result.isp,
            server: result.server,
            location: result.location
        });

        return result;
    }
}
