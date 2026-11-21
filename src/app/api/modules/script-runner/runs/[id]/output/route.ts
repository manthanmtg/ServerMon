import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { readOutput, MAX_OUTPUT_BYTES } from '@/lib/script-runner/output';
import { runIdInput } from '@/lib/script-runner/schemas';
import { findRun, outputPath, runResponse } from '@/lib/script-runner/store';
import { isActiveRun, type ScriptRun } from '@/modules/script-runner/types';
import { authorized, failure, type ById } from '../../../_shared';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();
const log = createLogger('api:script-runner:output');
const offsetInput = z.coerce.number().int().min(0).max(MAX_OUTPUT_BYTES);

async function download(id: string, run: ScriptRun) {
  if (run.logsPurgedAt) return failure('These logs have expired.', 410);
  const chunks: string[] = [];
  let cursor = 0;
  let more = true;
  while (more) {
    const page = await readOutput(outputPath(id), cursor);
    chunks.push(...page.entries.map((entry) => entry.text));
    cursor = page.cursor;
    more = page.more;
  }
  return new Response(chunks.join(''), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="script-${id}.log"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function eventStream(request: Request, id: string, first: ScriptRun, offset: number) {
  const abort = new AbortController();
  const signal = AbortSignal.any([abort.signal, request.signal]);
  const started = Date.now();
  let heartbeat = started;
  let previous: string | undefined;
  let cursor = offset;
  let initial: ScriptRun | undefined = first;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!signal.aborted && Date.now() - started < 45_000) {
          const record = initial ? null : await findRun(id).lean();
          const run = initial ?? (record ? runResponse(record) : null);
          initial = undefined;
          if (!run || signal.aborted) break;

          const page = run.logsPurgedAt ? null : await readOutput(outputPath(id), cursor);
          const meta = JSON.stringify(run);
          if (page) cursor = page.cursor;
          const done = !isActiveRun(run.status) && !page?.more;
          if (done || page?.entries.length || meta !== previous) {
            previous = meta;
            const batch = { cursor, run, entries: page?.entries ?? [] };
            controller.enqueue(
              encoder.encode(
                `id: ${cursor}\nevent: ${done ? 'done' : 'output'}\ndata: ${JSON.stringify(batch)}\n\n`
              )
            );
            if (done) controller.close();
            return;
          }
          if (Date.now() - heartbeat >= 10_000) {
            heartbeat = Date.now();
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
            return;
          }
          await delay(600, undefined, { signal });
        }
      } catch (error) {
        if (!signal.aborted) log.warn('Script output connection ended', { id, error });
      }
      if (!abort.signal.aborted) controller.close();
    },
    cancel() {
      abort.abort();
    },
  });
}

export function GET(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const id = runIdInput.parse((await params).id);
    const record = await findRun(id).lean();
    if (!record) return failure('Run not found.', 404);
    const run = runResponse(record);
    const search = new URL(request.url).searchParams;
    if (search.get('download') === '1') return download(id, run);
    const cursor = offsetInput.parse(
      request.headers.get('last-event-id') ?? search.get('cursor') ?? 0
    );
    return new Response(eventStream(request, id, run, cursor), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  });
}
