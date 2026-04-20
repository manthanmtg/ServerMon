import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { requireSession } from '../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:directories');

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const directories = await getAIRunnerService().listKnownDirectories();
    return NextResponse.json(directories);
  } catch (error) {
    log.error('Failed to list AI runner directories', error);
    return NextResponse.json({ error: 'Failed to list directories' }, { status: 500 });
  }
}
