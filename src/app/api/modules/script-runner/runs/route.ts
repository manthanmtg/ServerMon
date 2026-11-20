import { enqueueRun } from '@/lib/script-runner/queue';
import { runRequestInput } from '@/lib/script-runner/schemas';
import { runResponse } from '@/lib/script-runner/store';
import { authorized, body, data } from '../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return authorized(request, async (actor) => {
    const input = await body(request, runRequestInput);
    return data(runResponse(await enqueueRun(input, actor.username)), 202);
  });
}
