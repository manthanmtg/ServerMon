import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import CustomEndpoint from '@/models/CustomEndpoint';
import EndpointExecutionLog, {
  ENDPOINT_EXECUTION_LOG_BODY_MAX_CHARS,
  ENDPOINT_EXECUTION_LOG_ERROR_MAX_CHARS,
} from '@/models/EndpointExecutionLog';
import { executeEndpoint } from '@/lib/endpoints/executor';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints:test');

const stringRecordSchema = z.record(z.string(), z.string());

const testPayloadSchema = z.object({
  body: z
    .string()
    .optional()
    .catch('')
    .transform((value) => value ?? ''),
  headers: stringRecordSchema
    .optional()
    .catch({})
    .transform((value) => value ?? {}),
  queryParams: stringRecordSchema
    .optional()
    .catch({})
    .transform((value) => value ?? {}),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;

    const endpoint = await CustomEndpoint.findById(id);
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const payload = testPayloadSchema.parse(body);
    const testBody = payload.body;
    const testHeaders = payload.headers;
    const testQuery = payload.queryParams;

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
      stdout: result.stdout?.slice(0, ENDPOINT_EXECUTION_LOG_BODY_MAX_CHARS),
      stderr: result.stderr?.slice(0, ENDPOINT_EXECUTION_LOG_BODY_MAX_CHARS),
      error: result.error?.slice(0, ENDPOINT_EXECUTION_LOG_ERROR_MAX_CHARS),
      requestBody: testBody?.slice(0, ENDPOINT_EXECUTION_LOG_BODY_MAX_CHARS),
      responseBody: result.body?.slice(0, ENDPOINT_EXECUTION_LOG_BODY_MAX_CHARS),
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
