import { createLogger } from '@/lib/logger';
import type { ICustomEndpoint } from '@/models/CustomEndpoint';
import type { ExecutionInput, ExecutionResult } from './executor';

const log = createLogger('endpoints:logic');

export async function executeLogic(
  endpoint: ICustomEndpoint,
  input: ExecutionInput
): Promise<ExecutionResult> {
  const config = endpoint.logicConfig;

  if (!config) {
    return {
      statusCode: 500,
      headers: {},
      body: JSON.stringify({ error: 'Logic configuration is missing' }),
      error: 'Logic configuration is missing',
      duration: 0,
    };
  }

  try {
    let inputData: unknown = {};
    if (input.body) {
      try {
        inputData = JSON.parse(input.body);
      } catch {
        inputData = input.body;
      }
    }

    if (config.requestSchema) {
      try {
        const schema = JSON.parse(config.requestSchema);
        const validationErrors = validateAgainstSchema(inputData, schema);
        if (validationErrors.length > 0) {
          return {
            statusCode: 400,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              error: 'Validation failed',
              details: validationErrors,
            }),
            duration: 0,
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Schema parse error';
        log.error(`Schema validation error: ${msg}`);
      }
    }

    if (config.handlerCode) {
      const fn = new Function(
        'input',
        'query',
        'headers',
        'method',
        `"use strict";\n${config.handlerCode}`
      );

      const result = fn(inputData, input.query, input.headers, input.method);
      const resolved = result instanceof Promise ? await result : result;

      if (typeof resolved === 'object' && resolved !== null) {
        const statusCode = typeof resolved.statusCode === 'number' ? resolved.statusCode : 200;
        const responseHeaders: Record<string, string> = {
          'content-type': 'application/json',
          ...(typeof resolved.headers === 'object' ? resolved.headers : {}),
        };
        const body =
          resolved.body !== undefined
            ? typeof resolved.body === 'string'
              ? resolved.body
              : JSON.stringify(resolved.body)
            : JSON.stringify(resolved);

        return {
          statusCode,
          headers: responseHeaders,
          body: body.slice(0, 10_240),
          duration: 0,
        };
      }

      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(resolved).slice(0, 10_240),
        duration: 0,
      };
    }

    if (config.responseMapping) {
      try {
        const mapping = JSON.parse(config.responseMapping);
        return {
          statusCode: mapping.statusCode || 200,
          headers: { 'content-type': 'application/json', ...(mapping.headers || {}) },
          body: JSON.stringify(mapping.body || { message: 'OK' }),
          duration: 0,
        };
      } catch {
        return {
          statusCode: 200,
          headers: { 'content-type': 'text/plain' },
          body: config.responseMapping,
          duration: 0,
        };
      }
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'OK', input: inputData }),
      duration: 0,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Logic execution failed';
    log.error(`Logic execution error for ${endpoint.slug}: ${message}`);

    return {
      statusCode: 500,
      headers: {},
      body: JSON.stringify({ error: message }),
      error: message,
      duration: 0,
    };
  }
}

function validateAgainstSchema(data: unknown, schema: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (schema.type === 'object' && schema.required && Array.isArray(schema.required)) {
    if (typeof data !== 'object' || data === null) {
      errors.push('Expected an object');
      return errors;
    }
    const obj = data as Record<string, unknown>;
    for (const field of schema.required) {
      if (!(field in obj)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  if (schema.type === 'string' && typeof data !== 'string') {
    errors.push(`Expected string, got ${typeof data}`);
  }

  if (schema.type === 'number' && typeof data !== 'number') {
    errors.push(`Expected number, got ${typeof data}`);
  }

  return errors;
}
