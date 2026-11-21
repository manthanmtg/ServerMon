import { createEnvironment, environmentOverview } from '@/lib/python-environments/service';
import { authorized, body, createInput, data } from './_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return authorized(request, async () => data(await environmentOverview()));
}

export function POST(request: Request) {
  return authorized(request, async () => {
    const { name, interpreterId, requirements } = await body(request, createInput);
    return data(await createEnvironment(name, interpreterId, requirements), 202);
  });
}
