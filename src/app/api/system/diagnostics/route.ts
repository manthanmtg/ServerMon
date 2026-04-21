import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getRuntimeDiagnostics } from '@/lib/runtime-diagnostics';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:system:diagnostics');

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(getRuntimeDiagnostics().getSnapshot());
  } catch (error) {
    log.error('Failed to collect runtime diagnostics', error);
    return NextResponse.json({ error: 'Failed to collect diagnostics' }, { status: 500 });
  }
}
