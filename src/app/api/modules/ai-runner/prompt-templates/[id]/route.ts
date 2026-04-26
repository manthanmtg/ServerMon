import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { promptTemplateUpdateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:prompt-templates:id');

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const body = await parseBody(request, promptTemplateUpdateSchema);
    const template = await getAIRunnerService().updatePromptTemplate(id, body);
    if (!template)
      return NextResponse.json({ error: 'Prompt template not found' }, { status: 404 });
    return NextResponse.json(template);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to update AI runner prompt template', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update prompt template' },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const deleted = await getAIRunnerService().deletePromptTemplate(id);
    if (!deleted) return NextResponse.json({ error: 'Prompt template not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error('Failed to delete AI runner prompt template', error);
    return NextResponse.json({ error: 'Failed to delete prompt template' }, { status: 500 });
  }
}
