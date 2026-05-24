import { createLogger } from '@/lib/logger';
import type { ICustomEndpoint } from '@/models/CustomEndpoint';
import type { ExecutionInput, ExecutionResult } from './types';

const log = createLogger('endpoints:webhook');
const IDEMPOTENT_RETRY_METHODS = new Set(['GET', 'HEAD']);
const MAX_IDEMPOTENT_ATTEMPTS = 2;

function shouldRetryResponse(method: string, response: Response, attempt: number): boolean {
  return (
    attempt < MAX_IDEMPOTENT_ATTEMPTS &&
    IDEMPOTENT_RETRY_METHODS.has(method.toUpperCase()) &&
    response.status >= 500 &&
    response.status < 600
  );
}

function shouldRetryError(method: string, error: unknown, attempt: number): boolean {
  if (attempt >= MAX_IDEMPOTENT_ATTEMPTS || !IDEMPOTENT_RETRY_METHODS.has(method.toUpperCase())) {
    return false;
  }

  return error instanceof Error && error.name !== 'AbortError';
}

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

    for (let attempt = 1; attempt <= MAX_IDEMPOTENT_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(config.targetUrl, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        const reader = response.body?.getReader();
        let responseBody = '';
        if (reader) {
          const MAX_BODY_SIZE = 10_240;
          let bytesRead = 0;
          while (bytesRead < MAX_BODY_SIZE) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = new TextDecoder().decode(value);
            responseBody += chunk;
            bytesRead += value.length;
            if (responseBody.length > MAX_BODY_SIZE) {
              responseBody = responseBody.slice(0, MAX_BODY_SIZE);
              break;
            }
          }
          reader.releaseLock();
          // We don't necessarily need to cancel the stream here,
          // but we stop reading from it.
          // In some environments, not canceling might keep the connection open.
          if (response.body?.cancel) await response.body.cancel();
        }

        if (shouldRetryResponse(method, response, attempt)) {
          log.warn(`Retrying webhook ${endpoint.slug} after upstream ${response.status}`);
          continue;
        }

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
        if (shouldRetryError(method, err, attempt)) {
          const message = err instanceof Error ? err.message : 'Webhook network error';
          log.warn(`Retrying webhook ${endpoint.slug} after error: ${message}`);
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new Error('Webhook request failed after retry attempts');
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
