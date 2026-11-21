import { scriptStorageUsage } from '@/lib/script-runner/storage';
import { authorized, data } from '../_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return authorized(request, async () => data(await scriptStorageUsage()));
}
