import { runIdInput } from '@/lib/script-runner/schemas';
import { overview } from '@/lib/script-runner/store';
import { authorized, data } from './_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return authorized(request, async () => {
    const search = new URL(request.url).searchParams;
    const before = search.get('before');
    const inspected = search.get('inspected');
    return data(
      await overview(
        before ? runIdInput.parse(before) : undefined,
        inspected ? runIdInput.parse(inspected) : undefined
      )
    );
  });
}
