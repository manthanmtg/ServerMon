import { randomUUID } from 'node:crypto';
import { ScriptRunnerVariable } from '@/models/ScriptRunner';
import { sealVariable } from '@/lib/script-runner/environment';
import { variableInput } from '@/lib/script-runner/schemas';
import { runnerHost, variableResponse } from '@/lib/script-runner/store';
import { authorized, body, data, failure } from '../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return authorized(request, async () => {
    const { key, secret, value } = await body(request, variableInput);
    try {
      await ScriptRunnerVariable.init();
      const variable = await ScriptRunnerVariable.create({
        _id: randomUUID(),
        host: runnerHost,
        key,
        secret,
        valueSeal: sealVariable(value),
      });
      return data(variableResponse(variable), 201);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        return failure('An environment variable with this name already exists.', 409);
      }
      throw error;
    }
  });
}
