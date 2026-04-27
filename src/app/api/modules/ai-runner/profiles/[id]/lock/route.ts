import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { profileLockSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:profiles:lock');

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const body = await parseBody(request, profileLockSchema);
    const profile = await getAIRunnerService().lockProfile(id, body);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to update AI runner profile lock', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update profile lock' },
      { status: 400 }
    );
  }
}
