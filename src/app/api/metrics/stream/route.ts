import { metricsService, SystemMetric } from '@/lib/metrics';
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
  let onMetric: ((metric: SystemMetric) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      onMetric = (metric: SystemMetric) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(metric)}\n\n`));
        } catch {
          cleanup();
        }
      };

      metricsService.on('metric', onMetric);

      // Send latest immediately on connect
      const latest = metricsService.getCurrent();
      if (latest) onMetric(latest);
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (onMetric) {
      metricsService.off('metric', onMetric);
      onMetric = null;
    }
    metricsService.unregisterConnection();
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
