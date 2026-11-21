import { runIdInput } from '@/lib/script-runner/schemas';
import { requestStop } from '@/lib/script-runner/store';
import { authorized, data, failure, type ById } from '../../../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const run = await requestStop(runIdInput.parse((await params).id));
    return run ? data(run, 202) : failure('Run not found.', 404);
  });
}
