import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { dockerService } from '@/lib/docker/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:docker:networks');

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ networkId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { networkId } = await context.params;
    const result = await dockerService.removeNetwork(networkId);
    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to remove docker network', error);
    const message = error instanceof Error ? error.message : 'Failed to remove network';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
