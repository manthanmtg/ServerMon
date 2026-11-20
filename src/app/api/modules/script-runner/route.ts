import { runIdInput } from '@/lib/script-runner/schemas';
import { overview } from '@/lib/script-runner/store';
import { authorized, data } from './_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return authorized(request, async () => {
    const before = new URL(request.url).searchParams.get('before');
    return data(await overview(before ? runIdInput.parse(before) : undefined));
  });
}
