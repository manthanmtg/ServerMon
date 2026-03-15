import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { dockerService } from '@/lib/docker/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:docker:images');

export async function DELETE(_request: Request, context: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await context.params;
    const result = await dockerService.removeImage(imageId);
    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to remove docker image', error);
    return NextResponse.json({ error: 'Failed to remove image' }, { status: 500 });
  }
}
