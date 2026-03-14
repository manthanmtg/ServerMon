export const dynamic = 'force-dynamic';

export async function GET() {
    const encoder = new TextEncoder();
    let counter = 0;

    const stream = new ReadableStream({
        start(controller) {
            const interval = setInterval(() => {
                counter++;
                const message = `data: ${JSON.stringify({ counter, timestamp: new Date().toISOString() })}\n\n`;
                try {
                    controller.enqueue(encoder.encode(message));
                    if (counter >= 5) {
                        clearInterval(interval);
                        controller.close();
                    }
                } catch {
                    clearInterval(interval);
                }
            }, 1000);
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
