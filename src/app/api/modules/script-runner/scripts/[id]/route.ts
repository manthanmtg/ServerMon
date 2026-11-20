import { runIdInput, scriptPatchInput } from '@/lib/script-runner/schemas';
import { findScript, scriptResponse, storedDraft } from '@/lib/script-runner/store';
import { authorized, body, data, failure, type ById } from '../../_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const script = await findScript(runIdInput.parse((await params).id))
      .select('+source +environmentSeal')
      .lean();
    return script ? data(scriptResponse(script)) : failure('Script not found.', 404);
  });
}

export function PATCH(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const draft = await body(request, scriptPatchInput);
    const script = await findScript(runIdInput.parse((await params).id))
      .findOneAndUpdate({}, { $set: storedDraft(draft) }, { returnDocument: 'after' })
      .select('+source +environmentSeal')
      .lean();
    return script ? data(scriptResponse(script)) : failure('Script not found.', 404);
  });
}

export function DELETE(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const result = await findScript(runIdInput.parse((await params).id)).deleteOne();
    return result.deletedCount ? data({ deleted: true }) : failure('Script not found.', 404);
  });
}
