import { metricsService, SystemMetric } from '@/lib/metrics';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';

const log = createLogger('sse');

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

      // Send full history on connect so charts populate immediately
      const history = metricsService.getHistory();
      if (history.length > 0) {
        for (const metric of history) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(metric)}\n\n`));
          } catch {
            cleanup();
            return;
          }
        }
      } else {
        const latest = metricsService.getCurrent();
        if (latest) onMetric(latest);
      }
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
