import {
  deleteManagedApp,
  deployManagedApp,
  rollbackManagedApp,
  updateManagedGitApp,
  reconcileActiveAppRelease,
} from '@/lib/apps/service';
import type { ClaimedAppOperation } from '../repositories/operation-repository';
import type { AppOperationExecutorResult } from './runner';
import type { AppExecutionContext } from './runner';
import ManagedApp from '@/models/ManagedApp';

function resultFromDeployment(result: {
  status: string;
  releaseId?: string;
  error?: string;
}): AppOperationExecutorResult {
  if (result.status === 'active') {
    return { status: 'succeeded', result: { releaseId: result.releaseId } };
  }
  return {
    status: 'failed',
    result: { releaseId: result.releaseId },
    error: {
      code: 'LEGACY_DEPLOYMENT_FAILED',
      message: result.error ?? 'Legacy deployment failed',
      retryable: false,
    },
  };
}

export async function executeLegacyAppOperation(
  operation: ClaimedAppOperation,
  context: AppExecutionContext
): Promise<AppOperationExecutorResult> {
  await context.assertOwnership();
  const app = await ManagedApp.findById(operation.appId).lean();
  if (
    !app ||
    (operation.trigger === 'auto' &&
      (!app.autoUpdate.enabled ||
        (app.autoUpdate.scheduleGeneration ?? 0) !== operation.scheduleGeneration))
  ) {
    return {
      status: 'cancelled',
      result: { reason: 'Automatic schedule disabled or superseded, or app deleted' },
    };
  }
  if ((app.configVersion ?? 1) !== operation.configSnapshot.configVersion) {
    return {
      status: 'cancelled',
      result: { reason: 'App configuration changed after enqueue; queue a new operation' },
    };
  }
  if (operation.type === 'deploy') {
    return resultFromDeployment(await deployManagedApp(operation.appId, context));
  }

  if (operation.type === 'update') {
    await reconcileActiveAppRelease(operation.appId);
    await ManagedApp.updateOne(
      { _id: app._id, 'autoUpdate.scheduleGeneration': app.autoUpdate.scheduleGeneration ?? 0 },
      {
        $set: {
          'autoUpdate.lastOperationId': operation.id,
          'autoUpdate.lastAttemptAt': new Date(),
        },
      }
    );
    const result = await updateManagedGitApp(operation.appId, {
      ...context,
      trigger: operation.trigger ?? 'manual',
      durableOperationId: operation.id,
    });
    const commitSha = result.app.git?.currentSha;
    if (result.status === 'unchanged') {
      return { status: 'unchanged', result: { releaseId: result.releaseId, commitSha } };
    }
    const outcome = resultFromDeployment(result);
    return { ...outcome, result: { ...outcome.result, commitSha } };
  }

  if (operation.type === 'rollback') {
    if (!operation.targetReleaseId) {
      throw new Error('Rollback target release is required');
    }
    return resultFromDeployment(
      await rollbackManagedApp(operation.appId, operation.targetReleaseId, context)
    );
  }

  await deleteManagedApp(operation.appId);
  return { status: 'succeeded', result: { deleted: true } };
}
