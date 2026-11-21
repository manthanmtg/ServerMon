import { envGroupInput } from '@/lib/script-runner/schemas';
import { saveEnvGroup } from '@/lib/script-runner/variables';
import { authorized, body, data } from '../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return authorized(request, async () =>
    data(await saveEnvGroup(await body(request, envGroupInput)), 201)
  );
}
