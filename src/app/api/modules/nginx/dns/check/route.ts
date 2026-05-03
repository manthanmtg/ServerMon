import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { checkNginxDns } from '@/lib/nginx/dns';

export const dynamic = 'force-dynamic';

const log = createLogger('api:nginx:dns-check');

interface SessionUser {
  user: { username: string; role: string };
}

const BodyZ = z.object({
  domainPattern: z.string().min(1).max(253),
  serverIp: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = BodyZ.parse(await req.json());
    const result = await checkNginxDns(body.domainPattern, { serverIp: body.serverIp });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to check nginx DNS', error);
    return NextResponse.json({ error: 'Failed to check nginx DNS' }, { status: 500 });
  }
}
