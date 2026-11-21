import { runIdInput, scriptRetentionInput } from '@/lib/script-runner/schemas';
import { findScript } from '@/lib/script-runner/store';
import { authorized, body, data, failure, type ById } from '../../_shared';

export const dynamic = 'force-dynamic';

export function PUT(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const id = runIdInput.parse((await params).id);
    const retention = await body(request, scriptRetentionInput);
    const update = Object.keys(retention).length
      ? { $set: { retention } }
      : { $unset: { retention: 1 } };
    const result = await findScript(id).updateOne({}, update, { timestamps: false });
    return result.matchedCount ? data(retention) : failure('Script not found.', 404);
  });
}
