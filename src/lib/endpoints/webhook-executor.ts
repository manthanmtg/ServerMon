import { createLogger } from '@/lib/logger';
import type { ICustomEndpoint } from '@/models/CustomEndpoint';
import type { ExecutionInput, ExecutionResult } from './executor';

const log = createLogger('endpoints:webhook');

export async function executeWebhook(
  endpoint: ICustomEndpoint,
  input: ExecutionInput
): Promise<ExecutionResult> {
  const config = endpoint.webhookConfig;

  if (!config?.targetUrl) {
    return {
      statusCode: 500,
      headers: {},
      body: JSON.stringify({ error: 'Webhook target URL is not configured' }),
      error: 'Webhook target URL is not configured',
      duration: 0,
    };
  }

  const method = config.method || endpoint.method;
  const timeout = endpoint.timeout || 30_000;

  const headers: Record<string, string> = {
    'content-type': input.headers['content-type'] || 'application/json',
    'user-agent': 'ServerMon-Endpoints/1.0',
  };

  if (config.forwardHeaders) {
    for (const [key, value] of Object.entries(input.headers)) {
      const lower = key.toLowerCase();
      if (lower !== 'host' && lower !== 'authorization' && lower !== 'cookie') {
        headers[key] = value;
      }
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    let body: string | undefined;
    if (method !== 'GET') {
      if (config.transformBody) {
        try {
          const inputData = input.body ? JSON.parse(input.body) : {};
          const fn = new Function('input', 'query', 'headers', config.transformBody);
          body = JSON.stringify(fn(inputData, input.query, input.headers));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Transform error';
          log.error(`Body transform error: ${msg}`);
          body = input.body;
        }
      } else {
        body = input.body;
      }
    }

    const response = await fetch(config.targetUrl, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: responseBody.slice(0, 10_240),
      duration: 0,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook request failed';
    const isTimeout = err instanceof Error && err.name === 'AbortError';

    log.error(`Webhook error for ${endpoint.slug}: ${message}`);

    return {
      statusCode: isTimeout ? 504 : 502,
      headers: {},
      body: JSON.stringify({
        error: isTimeout ? `Webhook timed out after ${timeout}ms` : message,
      }),
      error: message,
      duration: 0,
    };
  }
}
