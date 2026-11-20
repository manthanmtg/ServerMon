import { runIdInput, scriptInput } from '@/lib/script-runner/schemas';
import { findScript, scriptResponse } from '@/lib/script-runner/store';
import { authorized, body, data, failure, type ById } from '../../_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const script = await findScript(runIdInput.parse((await params).id))
      .select('+source')
      .lean();
    return script ? data(scriptResponse(script)) : failure('Script not found.', 404);
  });
}

export function PATCH(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const draft = await body(request, scriptInput);
    const script = await findScript(runIdInput.parse((await params).id))
      .findOneAndUpdate({}, { $set: draft }, { returnDocument: 'after' })
      .select('+source')
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
