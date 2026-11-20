import { withLinkMutation } from '@/lib/script-runner/variables';
import { ScriptRunnerScript, ScriptRunnerVariable } from '@/models/ScriptRunner';
import { openVariable, sealVariable } from '@/lib/script-runner/environment';
import { runIdInput, variablePatchInput } from '@/lib/script-runner/schemas';
import { findVariable, runnerHost, variableResponse } from '@/lib/script-runner/store';
import { authorized, body, data, failure, type ById } from '../../_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const variable = await findVariable(runIdInput.parse((await params).id))
      .select('+valueSeal')
      .lean();
    if (!variable) return failure('Environment variable not found.', 404);
    return data({
      ...variableResponse(variable),
      ...(variable.secret ? {} : { value: openVariable(variable.valueSeal) }),
    });
  });
}

export function PATCH(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const { key, secret, value } = await body(request, variablePatchInput);
    const id = runIdInput.parse((await params).id);
    const keepPlain = !secret && value === undefined;
    try {
      await ScriptRunnerVariable.init();
      const updated = await findVariable(id)
        .findOneAndUpdate(
          keepPlain ? { secret: false } : {},
          {
            $set: {
              key,
              secret,
              ...(value === undefined ? {} : { valueSeal: sealVariable(value) }),
            },
          },
          { returnDocument: 'after' }
        )
        .lean();
      if (updated) return data(variableResponse(updated));
      if (keepPlain && (await findVariable(id).select('_id').lean())) {
        return failure(
          'Enter a replacement value before making this secret a regular variable.',
          422
        );
      }
      return failure('Environment variable not found.', 404);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        return failure('An environment variable with this name already exists.', 409);
      }
      throw error;
    }
  });
}

export function DELETE(request: Request, { params }: ById) {
  return authorized(request, async () =>
    withLinkMutation(async () => {
      const id = runIdInput.parse((await params).id);
      if (await ScriptRunnerScript.exists({ host: runnerHost, envVarIds: id })) {
        return failure('Unlink this variable from its saved scripts before deleting it.', 409);
      }
      const result = await findVariable(id).deleteOne();
      return result.deletedCount
        ? data({ deleted: true })
        : failure('Environment variable not found.', 404);
    })
  );
}
