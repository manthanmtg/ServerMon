import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { exportBundleQuerySchema } from '@/lib/ai-runner/schemas';
import { requireSession, zodErrorResponse } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:bundle:export');

export async function GET(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = exportBundleQuerySchema.parse({
      resources: searchParams.get('resources') ?? undefined,
    });
    const bundle = await getAIRunnerService().exportBundle(parsed.resources);
    return NextResponse.json(bundle);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to export AI runner bundle', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export AI Runner bundle' },
      { status: 500 }
    );
  }
}
