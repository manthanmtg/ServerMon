import { openEnvironment } from '@/lib/script-runner/environment';
import { runIdInput } from '@/lib/script-runner/schemas';
import { findRun, runResponse } from '@/lib/script-runner/store';
import { authorized, data, failure, type ById } from '../../_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const run = await findRun(runIdInput.parse((await params).id))
      .select('+source +environmentSeal')
      .lean();
    return run
      ? data({ ...runResponse(run), source: run.source, env: openEnvironment(run.environmentSeal) })
      : failure('Run not found.', 404);
  });
}
