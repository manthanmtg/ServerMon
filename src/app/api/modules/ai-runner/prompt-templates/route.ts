import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { promptTemplateCreateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:prompt-templates');

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(await getAIRunnerService().listPromptTemplates());
  } catch (error) {
    log.error('Failed to list AI runner prompt templates', error);
    return NextResponse.json({ error: 'Failed to list prompt templates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await parseBody(request, promptTemplateCreateSchema);
    const template = await getAIRunnerService().createPromptTemplate(body);
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to create AI runner prompt template', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create prompt template' },
      { status: 400 }
    );
  }
}
