import { metricsService } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET() {
    const encoder = new TextEncoder();
    let interval: NodeJS.Timeout | null = null;

    const stream = new ReadableStream({
        start(controller) {
            const sendMetric = async () => {
                try {
                    // Check if controller is closed or closing before enqueueing
                    const metric = await metricsService.getCurrent();
                    
                    // In some environments, controller might not have a closed check, 
                    // but we can try-catch the enqueue itself.
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(metric)}\n\n`));
                } catch (_err) {
                    // If controller is closed, enqueue will throw ERR_INVALID_STATE
                    if (interval) {
                        clearInterval(interval);
                        interval = null;
                    }
                    console.log('[SSE] Controller closed, stopping metrics stream');
                }
            };

            // Start periodic updates
            interval = setInterval(sendMetric, 1000);
        },
        cancel() {
            // Clean up when client disconnects
            if (interval) {
                clearInterval(interval);
                interval = null;
            }
            console.log('[SSE] Client disconnected, metrics stream terminated');
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
