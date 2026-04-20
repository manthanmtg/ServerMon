import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { requireSession } from '../../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:profiles:validate');

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const profile = await getAIRunnerService().getProfile(id);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    const result = await getAIRunnerService().validateProfileTemplate({
      invocationTemplate: profile.invocationTemplate,
      shell: profile.shell,
    });
    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to validate AI runner profile', error);
    return NextResponse.json({ error: 'Failed to validate profile' }, { status: 500 });
  }
}
