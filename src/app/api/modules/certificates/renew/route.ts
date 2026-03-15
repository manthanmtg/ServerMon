import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { certificatesService } from '@/lib/certificates/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:certificates:renew');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain } = body;

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    const result = await certificatesService.renewCertificate(domain);
    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to renew certificate', error);
    return NextResponse.json({ error: 'Failed to renew certificate' }, { status: 500 });
  }
}
