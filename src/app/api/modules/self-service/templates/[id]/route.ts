import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getTemplateById } from '@/modules/self-service/templates';
import { runDetection } from '@/modules/self-service/engine/provisioner';

export const dynamic = 'force-dynamic';

const log = createLogger('api:self-service:template-detail');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const template = getTemplateById(id);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const detectionResults = await runDetection(template.detection);

    return NextResponse.json({
      template,
      detection: detectionResults,
    });
  } catch (error) {
    log.error('Failed to fetch template detail', error);
    return NextResponse.json({ error: 'Failed to fetch template detail' }, { status: 500 });
  }
}
