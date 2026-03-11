import { metricsService } from '@/lib/metrics';
import { createLogger } from '@/lib/logger';

const log = createLogger('sse');

export const dynamic = 'force-dynamic';

export async function GET() {
    if (!metricsService.canAcceptConnection()) {
        log.warn('SSE connection rejected: limit reached');
        return new Response('Too many connections', { status: 429 });
    }

    metricsService.registerConnection();

    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
        start(controller) {
            const send = () => {
                try {
                    const metric = metricsService.getCurrent();
                    if (metric) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(metric)}\n\n`));
                    }
                } catch {
                    cleanup();
                }
            };

            interval = setInterval(send, 2000);
            send();
        },
        cancel() {
            cleanup();
        },
    });

    function cleanup() {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
        metricsService.unregisterConnection();
    }

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
