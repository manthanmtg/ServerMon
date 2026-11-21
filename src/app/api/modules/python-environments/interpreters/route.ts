import { queueInterpreterInstall } from '@/lib/python-environments/service';
import { authorized, body, data, interpreterInstallInput } from '../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return authorized(request, async () => {
    const { version } = await body(request, interpreterInstallInput);
    return data(await queueInterpreterInstall(version), 202);
  });
}
