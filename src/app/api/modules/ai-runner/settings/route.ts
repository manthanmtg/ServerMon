import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { settingsUpdateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:settings');

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const settings = await getAIRunnerService().getSettings();
    return NextResponse.json(settings);
  } catch (error) {
    log.error('Failed to load AI runner settings', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await parseBody(request, settingsUpdateSchema);
    const settings = await getAIRunnerService().updateSettings(body);
    return NextResponse.json(settings);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to update AI runner settings', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
