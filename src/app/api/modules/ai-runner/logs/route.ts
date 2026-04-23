import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { readAIRunnerLogEntries } from '@/lib/ai-runner/logs';
import { requireSession } from '../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:logs');

export async function GET(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 1000);
    const payload = await readAIRunnerLogEntries(limit);
    return NextResponse.json(payload);
  } catch (error) {
    log.error('Failed to list AI Runner logs', error);
    return NextResponse.json({ error: 'Failed to list AI Runner logs' }, { status: 500 });
  }
}
