import { NextRequest } from 'next/server';
import { SpeedtestService, type SpeedtestProgress } from '@/lib/network/speedtest';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger('api:speedtest');

export async function GET(_req: NextRequest) {
    const encoder = new TextEncoder();
    const speedtest = SpeedtestService.getInstance();
    
    const stream = new ReadableStream({
        async start(controller) {
            const sendUpdate = (data: SpeedtestProgress) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            log.info('Speedtest API: Starting test stream');
            
            try {
                await speedtest.runTest((progress: SpeedtestProgress) => {
                    sendUpdate(progress);
                });
            } catch (err: unknown) {
                log.error('Speedtest API: Error during test', err);
                const message = err instanceof Error ? err.message : 'Streaming failed';
                sendUpdate({ type: 'error', progress: 0, error: message });
            } finally {
                log.info('Speedtest API: Test completed, closing stream');
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
