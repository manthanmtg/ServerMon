import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { getAgentToolJobStore } from '@/lib/ai-agents/tool-jobs';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-agent-tool-jobs');

const JobRequestSchema = z.object({
  toolType: z.enum(['claude-code', 'codex', 'opencode', 'aider', 'gemini-cli', 'custom']),
  action: z.enum(['install', 'update']),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ jobs: getAgentToolJobStore().list() });
  } catch (error) {
    log.error('Failed to list AI agent tool jobs', error);
    return NextResponse.json({ error: 'Failed to list tool jobs' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = JobRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid tool job request' }, { status: 400 });
    }

    const job = getAgentToolJobStore().start(parsed.data.toolType, parsed.data.action);
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    log.error('Failed to start AI agent tool job', error);
    const message = error instanceof Error ? error.message : 'Failed to start tool job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
