import { envGroupInput, runIdInput } from '@/lib/script-runner/schemas';
import { findEnvGroup, runnerHost } from '@/lib/script-runner/store';
import { saveEnvGroup, withLinkMutation } from '@/lib/script-runner/variables';
import { ScriptRunnerScript } from '@/models/ScriptRunner';
import { authorized, body, data, failure, type ById } from '../../_shared';

export const dynamic = 'force-dynamic';

export function PATCH(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const id = runIdInput.parse((await params).id);
    return data(await saveEnvGroup(await body(request, envGroupInput), id));
  });
}

export function DELETE(request: Request, { params }: ById) {
  return authorized(request, async () =>
    withLinkMutation(async () => {
      const id = runIdInput.parse((await params).id);
      if (await ScriptRunnerScript.exists({ host: runnerHost, envGroupIds: id })) {
        return failure('Unlink this group from its saved scripts before deleting it.', 409);
      }
      const result = await findEnvGroup(id).deleteOne();
      return result.deletedCount
        ? data({ deleted: true })
        : failure('Variable group not found.', 404);
    })
  );
}
