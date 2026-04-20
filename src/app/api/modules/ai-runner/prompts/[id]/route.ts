import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { promptUpdateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:prompts:id');

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const body = await parseBody(request, promptUpdateSchema);
    const prompt = await getAIRunnerService().updatePrompt(id, body);
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }
    return NextResponse.json(prompt);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to update AI runner prompt', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update prompt' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const deleted = await getAIRunnerService().deletePrompt(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to delete AI runner prompt', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete prompt' },
      { status: 400 }
    );
  }
}
