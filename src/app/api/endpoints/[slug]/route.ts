import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import CustomEndpoint from '@/models/CustomEndpoint';
import EndpointExecutionLog from '@/models/EndpointExecutionLog';
import { executeEndpoint } from '@/lib/endpoints/executor';
import { verifyTokenBySlug } from '@/lib/endpoints/token-service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints:execute');

async function handleRequest(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    const { slug } = await params;

    const endpoint = await CustomEndpoint.findOne({ slug })
      .select('enabled method auth endpointType scriptLang scriptContent logicConfig webhookConfig envVars responseHeaders timeout')
      .lean();

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    if (!endpoint.enabled) {
      return NextResponse.json({ error: 'Endpoint is disabled' }, { status: 503 });
    }

    if (endpoint.method !== req.method) {
      return NextResponse.json(
        { error: `Method ${req.method} not allowed. Expected ${endpoint.method}` },
        { status: 405 }
      );
    }

    if (endpoint.auth === 'token') {
      const authHeader = req.headers.get('authorization') || '';
      const queryToken = new URL(req.url).searchParams.get('token') || '';
      const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

      if (!rawToken) {
        return NextResponse.json(
          { error: 'Authentication required. Provide a Bearer token or ?token= query param.' },
          { status: 401 }
        );
      }

      const valid = await verifyTokenBySlug(slug, rawToken);
      if (!valid) {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 });
      }
    }

    let body: string | undefined;
    if (req.method !== 'GET') {
      try {
        body = await req.text();
      } catch {
        body = undefined;
      }
    }

    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const query: Record<string, string> = {};
    new URL(req.url).searchParams.forEach((value, key) => {
      if (key !== 'token') {
        query[key] = value;
      }
    });

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '0.0.0.0';
    const userAgent = req.headers.get('user-agent') || '';

    const result = await executeEndpoint(endpoint, {
      method: req.method,
      body,
      headers,
      query,
      ip,
      userAgent,
    });

    await EndpointExecutionLog.create({
      endpointId: endpoint._id,
      method: req.method,
      statusCode: result.statusCode,
      duration: result.duration,
      stdout: result.stdout?.slice(0, 10_240),
      stderr: result.stderr?.slice(0, 10_240),
      error: result.error?.slice(0, 5_000),
      requestBody: body?.slice(0, 10_240),
      responseBody: result.body?.slice(0, 10_240),
      requestMeta: {
        ip,
        userAgent,
        contentType: req.headers.get('content-type') || undefined,
      },
      triggeredBy: 'external',
    }).catch((err: unknown) => {
      log.error('Failed to save execution log', err);
    });

    await CustomEndpoint.findByIdAndUpdate(endpoint._id, {
      lastExecutedAt: new Date(),
      lastStatus: result.statusCode,
      $inc: { executionCount: 1 },
    }).catch((err: unknown) => {
      log.error('Failed to update endpoint stats', err);
    });

    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(result.headers)) {
      responseHeaders.set(key, value);
    }

    if (endpoint.responseHeaders) {
      const customHeaders =
        endpoint.responseHeaders instanceof Map
          ? Object.fromEntries(endpoint.responseHeaders)
          : (endpoint.responseHeaders as Record<string, string>);
      for (const [key, value] of Object.entries(customHeaders)) {
        responseHeaders.set(key, String(value));
      }
    }

    return new NextResponse(result.body, {
      status: result.statusCode,
      headers: responseHeaders,
    });
  } catch (error) {
    log.error('Endpoint execution failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
