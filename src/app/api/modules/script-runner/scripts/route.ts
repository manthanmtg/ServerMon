import { resolvePythonRevision } from '@/lib/python-environments/references';
import { validateLinkedEnvironment, withLinkMutation } from '@/lib/script-runner/variables';
import { scriptInput } from '@/lib/script-runner/schemas';
import { storeScript } from '@/lib/script-runner/store';
import { authorized, body, data, RequestError } from '../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return authorized(request, async () => {
    const draft = await body(request, scriptInput);
    if (draft.pythonEnvironmentId && draft.language !== 'python') {
      throw new RequestError('Managed environments are available for Python scripts.', 422);
    }
    if (!draft.envVarIds?.length && !draft.envGroupIds?.length && !draft.pythonEnvironmentId)
      return data(await storeScript(draft), 201);
    return withLinkMutation(async () => {
      if (draft.pythonEnvironmentId) await resolvePythonRevision(draft.pythonEnvironmentId);
      await validateLinkedEnvironment(draft, draft.env);
      return data(await storeScript(draft), 201);
    });
  });
}
