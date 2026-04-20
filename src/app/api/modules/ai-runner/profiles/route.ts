import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { profileCreateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:profiles');

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const profiles = await getAIRunnerService().listProfiles();
    return NextResponse.json(profiles);
  } catch (error) {
    log.error('Failed to list AI runner profiles', error);
    return NextResponse.json({ error: 'Failed to list profiles' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await parseBody(request, profileCreateSchema);
    const profile = await getAIRunnerService().createProfile(body);
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to create AI runner profile', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create profile' },
      { status: 400 }
    );
  }
}
