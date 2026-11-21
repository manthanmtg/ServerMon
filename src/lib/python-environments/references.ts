import { hostname } from 'node:os';
import { PythonEnvironment } from '@/models/PythonEnvironment';
import type { PythonEnvironmentSelection } from '@/modules/python-environments/types';
import { PythonEnvironmentError } from './requirements';

export { PythonEnvironmentError } from './requirements';
export const pythonEnvironmentHost = hostname();

export async function resolvePythonRevision(
  environmentId: string,
  revisionId?: string
): Promise<PythonEnvironmentSelection> {
  const environment = await PythonEnvironment.findOne({
    host: pythonEnvironmentHost,
    _id: environmentId,
    deleting: { $ne: true },
  })
    .select('name activeRevisionId revisions.id revisions.stage revisions.pythonVersion')
    .lean();
  const revision = environment?.revisions.find(
    ({ id, stage }) => id === (revisionId ?? environment.activeRevisionId) && stage === 'ready'
  );
  if (!environment || !revision?.pythonVersion) {
    throw new PythonEnvironmentError(
      revisionId
        ? 'The recorded Python environment revision is no longer available.'
        : 'The selected Python environment is not ready.',
      422
    );
  }
  return {
    environmentId,
    revisionId: revision.id,
    name: environment.name,
    pythonVersion: revision.pythonVersion,
  };
}

export async function listReadyPythonEnvironments() {
  const environments = await PythonEnvironment.find({
    host: pythonEnvironmentHost,
    deleting: { $ne: true },
    activeRevisionId: { $exists: true },
  })
    .select('name activeRevisionId revisions.id revisions.stage revisions.pythonVersion')
    .sort({ nameKey: 1 })
    .lean();
  return environments.flatMap((environment) => {
    const revision = environment.revisions.find(
      ({ id, stage }) => id === environment.activeRevisionId && stage === 'ready'
    );
    return revision?.pythonVersion
      ? [{ id: environment._id, name: environment.name, pythonVersion: revision.pythonVersion }]
      : [];
  });
}
