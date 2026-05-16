import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { nginxService } from '@/lib/nginx/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:nginx:reload');

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await nginxService.reloadNginx();
    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to reload nginx', error);
    return NextResponse.json({ error: 'Failed to reload nginx' }, { status: 500 });
  }
}
