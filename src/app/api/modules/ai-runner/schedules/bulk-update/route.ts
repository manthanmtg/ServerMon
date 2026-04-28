import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { scheduleBulkUpdateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:schedules:bulk-update');

function getBulkRowErrors(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'rowErrors' in error &&
    Array.isArray((error as { rowErrors?: unknown }).rowErrors)
  ) {
    return (error as { rowErrors: unknown[] }).rowErrors;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await parseBody(request, scheduleBulkUpdateSchema);
    const result = await getAIRunnerService().bulkUpdateSchedules(body.updates);
    return NextResponse.json(result);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;

    const rowErrors = getBulkRowErrors(error);
    if (rowErrors) {
      return NextResponse.json(
        { error: 'Bulk schedule update failed validation', rowErrors },
        { status: 400 }
      );
    }

    log.error('Failed to bulk update AI runner schedules', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to bulk update schedules' },
      { status: 500 }
    );
  }
}
