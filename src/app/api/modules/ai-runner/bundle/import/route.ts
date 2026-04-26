import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { importBundleSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:bundle:import');

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') === 'apply' ? 'apply' : 'preview';
    const body = await parseBody(request, importBundleSchema);
    const service = getAIRunnerService();
    const result =
      mode === 'apply'
        ? await service.importBundle(body)
        : await service.previewImportBundle(body.bundle, body.selectedResources);
    return NextResponse.json(result);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to import AI runner bundle', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import AI Runner bundle' },
      { status: 400 }
    );
  }
}
