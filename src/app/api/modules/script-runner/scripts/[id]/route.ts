import { resolvePythonRevision } from '@/lib/python-environments/references';
import { openEnvironment } from '@/lib/script-runner/environment';
import { validateLinkedEnvironment, withLinkMutation } from '@/lib/script-runner/variables';
import { z } from 'zod';
import { runIdInput, scriptFolderPatchInput, scriptPatchInput } from '@/lib/script-runner/schemas';
import { findScript, scriptResponse, scriptSummary, storedDraft } from '@/lib/script-runner/store';
import { authorized, body, data, failure, RequestError, type ById } from '../../_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const script = await findScript(runIdInput.parse((await params).id))
      .select('+source +environmentSeal +attachments')
      .lean();
    return script ? data(scriptResponse(script)) : failure('Script not found.', 404);
  });
}

export function PATCH(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const draft = await body(request, z.union([scriptFolderPatchInput, scriptPatchInput]));
    if (!('source' in draft)) {
      const script = await findScript(runIdInput.parse((await params).id))
        .findOneAndUpdate({}, { $set: { folder: draft.folder } }, { returnDocument: 'after' })
        .lean();
      return script ? data(scriptSummary(script)) : failure('Script not found.', 404);
    }
    const id = runIdInput.parse((await params).id);
    return withLinkMutation(async () => {
      const current = await findScript(id).select('+environmentSeal').lean();
      if (!current) return failure('Script not found.', 404);
      const pythonEnvironmentId =
        draft.pythonEnvironmentId === undefined
          ? current.pythonEnvironmentId
          : draft.pythonEnvironmentId;
      if (pythonEnvironmentId) {
        if ((draft.language ?? current.language) !== 'python') {
          throw new RequestError('Managed environments are available for Python scripts.', 422);
        }
        await resolvePythonRevision(pythonEnvironmentId);
      }
      await validateLinkedEnvironment(
        {
          envVarIds: draft.envVarIds ?? current.envVarIds,
          envGroupIds: draft.envGroupIds ?? current.envGroupIds,
        },
        draft.env ?? openEnvironment(current.environmentSeal)
      );
      const script = await findScript(id)
        .findOneAndUpdate({}, { $set: storedDraft(draft) }, { returnDocument: 'after' })
        .select('+source +environmentSeal +attachments')
        .lean();
      return script ? data(scriptResponse(script)) : failure('Script not found.', 404);
    });
  });
}

export function DELETE(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const result = await findScript(runIdInput.parse((await params).id)).deleteOne();
    return result.deletedCount ? data({ deleted: true }) : failure('Script not found.', 404);
  });
}
