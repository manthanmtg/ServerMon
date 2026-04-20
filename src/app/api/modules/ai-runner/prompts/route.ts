import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { promptCreateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:prompts');

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const prompts = await getAIRunnerService().listPrompts();
    return NextResponse.json(prompts);
  } catch (error) {
    log.error('Failed to list AI runner prompts', error);
    return NextResponse.json({ error: 'Failed to list prompts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await parseBody(request, promptCreateSchema);
    const prompt = await getAIRunnerService().createPrompt(body);
    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to create AI runner prompt', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create prompt' },
      { status: 400 }
    );
  }
}
