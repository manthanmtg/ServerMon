import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { fleetEventBus, type FleetEvent, type FleetEventKind } from '@/lib/fleet/eventBus';

export const dynamic = 'force-dynamic';

const ALLOWED_KINDS: readonly FleetEventKind[] = [
  'node.heartbeat',
  'node.status_change',
  'node.reboot',
  'route.status_change',
  'revision.applied',
  'frp.state_change',
];

function parseKind(raw: string | null): FleetEventKind | undefined {
  if (!raw) return undefined;
  return (ALLOWED_KINDS as readonly string[]).includes(raw) ? (raw as FleetEventKind) : undefined;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const nodeId = searchParams.get('nodeId') ?? undefined;
  const routeId = searchParams.get('routeId') ?? undefined;
  const kind = parseKind(searchParams.get('kind'));

  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const write = (ev: FleetEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: ${ev.kind}\ndata: ${JSON.stringify(ev)}\n\n`));
        } catch {
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        }
      };

      // initial ping so clients can confirm the stream is open
      controller.enqueue(encoder.encode(`event: ping\ndata: {"ok":true}\n\n`));

      unsubscribe = fleetEventBus.subscribeFiltered({ nodeId, routeId, kind }, write);
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
