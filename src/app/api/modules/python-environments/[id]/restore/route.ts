import { restoreEnvironment } from '@/lib/python-environments/service';
import { authorized, body, data, restoreInput, validateId, type ById } from '../../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const { revisionId } = await body(request, restoreInput);
    return data(await restoreEnvironment(validateId((await params).id), revisionId));
  });
}
