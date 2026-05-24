import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { dockerService } from '@/lib/docker/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:docker:images');

export async function DELETE(_request: Request, context: { params: Promise<{ imageId: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { imageId } = await context.params;
    const result = await dockerService.removeImage(imageId);
    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to remove docker image', error);
    const message = error instanceof Error ? error.message : 'Failed to remove image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
