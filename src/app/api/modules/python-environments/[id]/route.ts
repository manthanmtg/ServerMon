import {
  buildEnvironment,
  deleteEnvironment,
  environmentDetail,
} from '@/lib/python-environments/service';
import { authorized, body, buildInput, data, validateId, type ById } from '../_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: ById) {
  return authorized(request, async () =>
    data(await environmentDetail(validateId((await params).id)))
  );
}

export function PATCH(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const { requirements } = await body(request, buildInput);
    return data(await buildEnvironment(validateId((await params).id), requirements), 202);
  });
}

export function DELETE(request: Request, { params }: ById) {
  return authorized(request, async () =>
    data(await deleteEnvironment(validateId((await params).id)), 202)
  );
}
