import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { writeManagedConfig } from '@/lib/nginx/managed-config';
import { renderManagedServerBlock } from '@/lib/nginx/renderer';

export const dynamic = 'force-dynamic';

const log = createLogger('api:nginx:vhosts');

interface SessionUser {
  user: { username: string; role: string };
}

const HeaderMapZ = z.record(z.string(), z.string()).default({});

const GuidedZ = z.object({
  mode: z.literal('guided'),
  fileName: z.string().min(1).max(120),
  domainPattern: z.string().min(1).max(253),
  upstreamProtocol: z.enum(['http', 'https']),
  upstreamHost: z.string().min(1).max(253),
  upstreamPort: z.number().int().min(1).max(65535),
  redirectHttp: z.boolean().default(false),
  websocket: z.boolean().default(false),
  tlsMode: z.enum(['none', 'existing']),
  certificatePath: z.string().max(500).optional(),
  certificateKeyPath: z.string().max(500).optional(),
  maxBodyMb: z.number().int().min(1).max(1024).default(32),
  timeoutSeconds: z.number().int().min(1).max(3600).default(60),
  headers: HeaderMapZ,
});

const RawZ = z.object({
  mode: z.literal('raw'),
  fileName: z.string().min(1).max(120),
  rawConfig: z.string().min(1).max(500000),
});

const BodyZ = z.discriminatedUnion('mode', [GuidedZ, RawZ]);

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = BodyZ.parse(await req.json());
    const content =
      body.mode === 'raw'
        ? body.rawConfig
        : renderManagedServerBlock({
            domainPattern: body.domainPattern,
            upstreamProtocol: body.upstreamProtocol,
            upstreamHost: body.upstreamHost,
            upstreamPort: body.upstreamPort,
            redirectHttp: body.redirectHttp,
            websocket: body.websocket,
            tlsMode: body.tlsMode,
            certificatePath: body.certificatePath,
            certificateKeyPath: body.certificateKeyPath,
            maxBodyMb: body.maxBodyMb,
            timeoutSeconds: body.timeoutSeconds,
            headers: body.headers,
          });

    const result = await writeManagedConfig({ fileName: body.fileName, content });
    if (!result.ok) {
      return NextResponse.json(
        { error: 'Nginx config test failed', result },
        { status: 409 }
      );
    }

    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to create nginx vhost', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create nginx vhost' },
      { status: 500 }
    );
  }
}
