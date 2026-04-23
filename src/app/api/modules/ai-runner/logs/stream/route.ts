import { createLogger } from '@/lib/logger';
import {
  getAIRunnerLogSize,
  parseAIRunnerLogLine,
  readAIRunnerLogSlice,
} from '@/lib/ai-runner/logs';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:logs:stream');

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let keepAliveHandle: ReturnType<typeof setInterval> | null = null;
  let offset = await getAIRunnerLogSize();
  let remainder = '';

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const flushNewEntries = async () => {
        try {
          const chunk = await readAIRunnerLogSlice(offset);
          if (!chunk.text) return;

          offset = chunk.nextOffset;
          remainder += chunk.text;
          const lines = remainder.split('\n');
          remainder = lines.pop() ?? '';

          for (const line of lines) {
            const entry = parseAIRunnerLogLine(line);
            if (!entry) continue;
            enqueue(`data: ${JSON.stringify(entry)}\n\n`);
          }
        } catch (error) {
          log.error('Failed streaming AI Runner logs', error);
          enqueue(
            `event: error\ndata: ${JSON.stringify({
              message: error instanceof Error ? error.message : 'Failed streaming AI Runner logs',
            })}\n\n`
          );
        }
      };

      enqueue(': connected\n\n');
      intervalHandle = setInterval(() => {
        void flushNewEntries();
      }, 1000);
      keepAliveHandle = setInterval(() => {
        enqueue(': keep-alive\n\n');
      }, 15000);
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    if (keepAliveHandle) {
      clearInterval(keepAliveHandle);
      keepAliveHandle = null;
    }
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
