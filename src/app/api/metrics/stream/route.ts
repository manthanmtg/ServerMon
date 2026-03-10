import { metricsService } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET() {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const sendMetric = async () => {
                try {
                    const metric = await metricsService.getCurrent();
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(metric)}\n\n`));
                } catch (err) {
                    console.error('[SSE] Error sending metric:', err);
                }
            };

            // Send initial burst/history if needed, or just start periodic
            const interval = setInterval(sendMetric, 1000);

            // Clean up on close
            return () => {
                clearInterval(interval);
            };
        },
        cancel() {
            // Handles client disconnect
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
