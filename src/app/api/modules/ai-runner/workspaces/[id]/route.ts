import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { workspaceUpdateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:workspaces:id');

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const body = await parseBody(request, workspaceUpdateSchema);
    const workspace = await getAIRunnerService().updateWorkspace(id, body);
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    return NextResponse.json(workspace);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to update AI runner workspace', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update workspace' },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const deleted = await getAIRunnerService().deleteWorkspace(id);
    if (!deleted) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error('Failed to delete AI runner workspace', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete workspace' },
      { status: 400 }
    );
  }
}
