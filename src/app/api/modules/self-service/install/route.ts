import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { createJob } from '@/modules/self-service/engine/job-manager';
import type { InstallRequest } from '@/modules/self-service/types';

export const dynamic = 'force-dynamic';

const log = createLogger('api:self-service:install');

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return session?.user?.role === 'admin';
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<InstallRequest>;

    if (!body.templateId || !body.methodId || !body.config) {
      return NextResponse.json(
        { error: 'Missing required fields: templateId, methodId, config' },
        { status: 400 }
      );
    }

    const installRequest: InstallRequest = {
      templateId: body.templateId,
      methodId: body.methodId,
      config: body.config,
    };

    const result = createJob(installRequest);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    log.info(`Install job created: ${result.id} for ${result.templateName} (${result.methodId})`);

    return NextResponse.json({ job: result }, { status: 201 });
  } catch (error) {
    log.error('Failed to create install job', error);
    return NextResponse.json({ error: 'Failed to create install job' }, { status: 500 });
  }
}
