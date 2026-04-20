import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { profileValidateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:profiles:validate:draft');

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await parseBody(request, profileValidateSchema);
    const result = await getAIRunnerService().validateProfileTemplate(body);
    return NextResponse.json(result);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to validate draft AI runner profile', error);
    return NextResponse.json({ error: 'Failed to validate profile' }, { status: 500 });
  }
}
