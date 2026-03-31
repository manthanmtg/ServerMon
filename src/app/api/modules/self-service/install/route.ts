import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { createJob } from '@/modules/self-service/engine/job-manager';
import type { InstallRequest } from '@/modules/self-service/types';

export const dynamic = 'force-dynamic';

const log = createLogger('api:self-service:install');

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<InstallRequest>;

    if (!body.templateId || !body.methodId || !body.config) {
      return NextResponse.json(
        { error: 'Missing required fields: templateId, methodId, config' },
        { status: 400 },
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
