import { validateLinkedEnvironment, withLinkMutation } from '@/lib/script-runner/variables';
import { scriptInput } from '@/lib/script-runner/schemas';
import { storeScript } from '@/lib/script-runner/store';
import { authorized, body, data } from '../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return authorized(request, async () => {
    const draft = await body(request, scriptInput);
    if (!draft.envVarIds?.length) return data(await storeScript(draft), 201);
    return withLinkMutation(async () => {
      await validateLinkedEnvironment(draft.envVarIds, draft.env);
      return data(await storeScript(draft), 201);
    });
  });
}
