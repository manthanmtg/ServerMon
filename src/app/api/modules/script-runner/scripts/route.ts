import { scriptInput } from '@/lib/script-runner/schemas';
import { storeScript } from '@/lib/script-runner/store';
import { authorized, body, data } from '../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return authorized(request, async () =>
    data(await storeScript(await body(request, scriptInput)), 201)
  );
}
