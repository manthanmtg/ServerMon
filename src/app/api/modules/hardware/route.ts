import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { hardwareService } from '@/lib/hardware/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:hardware');

export async function GET() {
  try {
    const snapshot = await hardwareService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to fetch hardware snapshot', error);
    return NextResponse.json({ error: 'Failed to fetch hardware snapshot' }, { status: 500 });
  }
}
