import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { getManagedDatabaseExplorerTarget } from '@/lib/databases/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:databases:explore:proxy');
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return Boolean(session?.user?.role === 'admin');
}

function proxyHeaders(request: Request): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers);
  headers.delete('content-security-policy');
  headers.delete('x-frame-options');
  headers.delete('content-encoding');
  headers.delete('content-length');
  return headers;
}

async function proxyExplorerRequest(
  request: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, path = [] } = await params;
    const target = await getManagedDatabaseExplorerTarget(id);
    const requestUrl = new URL(request.url);
    const upstreamPath = path.map(encodeURIComponent).join('/');
    const upstreamUrl = new URL(`http://127.0.0.1:${target.port}/${upstreamPath}`);
    upstreamUrl.search = requestUrl.search;

    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer();
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: proxyHeaders(request),
      body,
      redirect: 'manual',
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to proxy database explorer';
    log.error('Failed to proxy database explorer', { error: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const GET = proxyExplorerRequest;
export const HEAD = proxyExplorerRequest;
export const POST = proxyExplorerRequest;
export const PUT = proxyExplorerRequest;
export const PATCH = proxyExplorerRequest;
export const DELETE = proxyExplorerRequest;
