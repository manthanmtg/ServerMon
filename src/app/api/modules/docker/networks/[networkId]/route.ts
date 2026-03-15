import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { dockerService } from '@/lib/docker/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:docker:networks');

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ networkId: string }> }
) {
  try {
    const { networkId } = await context.params;
    const result = await dockerService.removeNetwork(networkId);
    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to remove docker network', error);
    return NextResponse.json({ error: 'Failed to remove network' }, { status: 500 });
  }
}
