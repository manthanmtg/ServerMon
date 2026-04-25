import { createLogger } from '@/lib/logger';
import { executeScript } from './script-executor';
import { executeWebhook } from './webhook-executor';
import { executeLogic } from './logic-executor';
import type { ICustomEndpoint } from '@/models/CustomEndpoint';
import type { ExecutionInput, ExecutionResult } from './types';

const log = createLogger('endpoints:executor');

export async function executeEndpoint(
  endpoint: ICustomEndpoint,
  input: ExecutionInput
): Promise<ExecutionResult> {
  const start = Date.now();

  try {
    let result: ExecutionResult;

    switch (endpoint.endpointType) {
      case 'script':
        result = await executeScript(endpoint, input);
        break;
      case 'webhook':
        result = await executeWebhook(endpoint, input);
        break;
      case 'logic':
        result = await executeLogic(endpoint, input);
        break;
      default:
        result = {
          statusCode: 500,
          headers: {},
          body: JSON.stringify({ error: `Unknown endpoint type: ${endpoint.endpointType}` }),
          duration: Date.now() - start,
        };
    }

    result.duration = Date.now() - start;
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown execution error';
    log.error(`Execution failed for endpoint ${endpoint.slug}: ${message}`);

    return {
      statusCode: 500,
      headers: {},
      body: JSON.stringify({ error: message }),
      error: message,
      duration: Date.now() - start,
    };
  }
}
