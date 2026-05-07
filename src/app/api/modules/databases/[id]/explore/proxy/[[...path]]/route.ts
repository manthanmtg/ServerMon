import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { buildExplorerProxyPath, getManagedDatabaseExplorerTarget } from '@/lib/databases/service';

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

function normalizePath(path: string): string {
  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}

function rewriteExplorerLocation(input: {
  location: string;
  requestUrl: URL;
  upstreamUrl: URL;
  upstreamBasePath?: string;
  proxyBasePath: string;
}): string {
  const resolvedLocation = new URL(input.location, input.upstreamUrl);
  if (resolvedLocation.origin !== input.upstreamUrl.origin) return input.location;

  const normalizedProxyBasePath = `${normalizePath(input.proxyBasePath)}/`;
  const normalizedUpstreamBasePath = input.upstreamBasePath
    ? normalizePath(input.upstreamBasePath)
    : undefined;
  const upstreamPath =
    normalizedUpstreamBasePath &&
    (resolvedLocation.pathname === normalizedUpstreamBasePath ||
      resolvedLocation.pathname.startsWith(`${normalizedUpstreamBasePath}/`))
      ? resolvedLocation.pathname.slice(normalizedUpstreamBasePath.length).replace(/^\/+/, '')
      : resolvedLocation.pathname.replace(/^\/+/, '');
  const externalPath = `${normalizedProxyBasePath}${upstreamPath}`;

  return `${input.requestUrl.origin}${externalPath}${resolvedLocation.search}${resolvedLocation.hash}`;
}

function responseHeaders(input: {
  upstream: Response;
  requestUrl: URL;
  upstreamUrl: URL;
  upstreamBasePath?: string;
  proxyBasePath: string;
}): Headers {
  const { upstream } = input;
  const headers = new Headers(upstream.headers);
  headers.delete('content-security-policy');
  headers.delete('x-frame-options');
  headers.delete('content-encoding');
  headers.delete('content-length');
  const location = headers.get('location');
  if (location) {
    headers.set('location', rewriteExplorerLocation({ ...input, location }));
  }
  return headers;
}

function buildUpstreamPath(basePath: string | undefined, path: string[]): string {
  const normalizedBase = basePath ? `/${basePath.replace(/^\/+|\/+$/g, '')}` : '';
  const nestedPath = path.map(encodeURIComponent).join('/');
  if (normalizedBase && nestedPath) return `${normalizedBase}/${nestedPath}`;
  if (normalizedBase) return `${normalizedBase}/`;
  return `/${nestedPath}`;
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
    const proxyBasePath = buildExplorerProxyPath(id);
    const upstreamUrl = new URL(
      buildUpstreamPath(target.upstreamBasePath, path),
      `http://127.0.0.1:${target.port}`
    );
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
      headers: responseHeaders({
        upstream,
        requestUrl,
        upstreamUrl,
        upstreamBasePath: target.upstreamBasePath,
        proxyBasePath,
      }),
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
