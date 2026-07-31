import {
  deleteManagedApp,
  deployManagedApp,
  rollbackManagedApp,
  updateManagedGitApp,
} from '@/lib/apps/service';
import type { ClaimedAppOperation } from '../repositories/operation-repository';
import type { AppOperationExecutorResult } from './runner';

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
  operation: ClaimedAppOperation
): Promise<AppOperationExecutorResult> {
  if (operation.type === 'deploy') {
    return resultFromDeployment(await deployManagedApp(operation.appId));
  }

  if (operation.type === 'update') {
    const result = await updateManagedGitApp(operation.appId);
    if (result.status === 'unchanged') {
      return { status: 'unchanged', result: { releaseId: result.releaseId } };
    }
    return resultFromDeployment(result);
  }

  if (operation.type === 'rollback') {
    if (!operation.targetReleaseId) {
      throw new Error('Rollback target release is required');
    }
    return resultFromDeployment(
      await rollbackManagedApp(operation.appId, operation.targetReleaseId)
    );
  }

  await deleteManagedApp(operation.appId);
  return { status: 'succeeded', result: { deleted: true } };
}
