import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import CustomEndpoint from '@/models/CustomEndpoint';
import EndpointExecutionLog from '@/models/EndpointExecutionLog';
import { executeEndpoint } from '@/lib/endpoints/executor';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints:test');

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;

    const endpoint = await CustomEndpoint.findById(id);
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const testBody = body.body || '';
    const testHeaders = body.headers || {};
    const testQuery = body.queryParams || {};

    const result = await executeEndpoint(endpoint, {
      method: endpoint.method,
      body: testBody,
      headers: testHeaders,
      query: testQuery,
      ip: '127.0.0.1',
      userAgent: 'ServerMon-TestConsole/1.0',
    });

    await EndpointExecutionLog.create({
      endpointId: endpoint._id,
      method: endpoint.method,
      statusCode: result.statusCode,
      duration: result.duration,
      stdout: result.stdout?.slice(0, 10_240),
      stderr: result.stderr?.slice(0, 10_240),
      error: result.error?.slice(0, 5_000),
      requestBody: testBody?.slice(0, 10_240),
      responseBody: result.body?.slice(0, 10_240),
      requestMeta: {
        ip: '127.0.0.1',
        userAgent: 'ServerMon-TestConsole/1.0',
        contentType: testHeaders['content-type'],
      },
      triggeredBy: 'test',
    });

    await CustomEndpoint.findByIdAndUpdate(id, {
      lastExecutedAt: new Date(),
      lastStatus: result.statusCode,
      $inc: { executionCount: 1 },
    });

    log.info(
      `Test run for endpoint ${endpoint.slug}: ${result.statusCode} in ${result.duration}ms`
    );

    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to test endpoint', error);
    return NextResponse.json({ error: 'Failed to test endpoint' }, { status: 500 });
  }
}
