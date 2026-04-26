import connectDB from '@/lib/db';
import AIRunnerSettings from '@/models/AIRunnerSettings';
import type { AIRunnerSettingsDTO } from '@/modules/ai-runner/types';
import { getDefaultAIRunnerArtifactBaseDir } from './artifact-store';

const AI_RUNNER_SETTINGS_ID = 'airunner-settings';
const DEFAULT_MONGO_RETENTION_DAYS = 30;
const DEFAULT_ARTIFACT_RETENTION_DAYS = 90;

function mapSettings(doc: {
  schedulesGloballyEnabled?: boolean;
  autoflowMode?: 'sequential' | 'parallel';
  artifactBaseDir?: string;
  mongoRetentionDays?: number;
  artifactRetentionDays?: number;
  updatedAt?: Date | string;
}): AIRunnerSettingsDTO {
  return {
    schedulesGloballyEnabled: doc.schedulesGloballyEnabled ?? true,
    autoflowMode: doc.autoflowMode === 'parallel' ? 'parallel' : 'sequential',
    artifactBaseDir: doc.artifactBaseDir?.trim() || getDefaultAIRunnerArtifactBaseDir(),
    mongoRetentionDays:
      typeof doc.mongoRetentionDays === 'number'
        ? Math.max(1, Math.floor(doc.mongoRetentionDays))
        : DEFAULT_MONGO_RETENTION_DAYS,
    artifactRetentionDays:
      typeof doc.artifactRetentionDays === 'number'
        ? Math.max(1, Math.floor(doc.artifactRetentionDays))
        : DEFAULT_ARTIFACT_RETENTION_DAYS,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

export async function getAIRunnerSettings(): Promise<AIRunnerSettingsDTO> {
  await connectDB();
  const existing = await AIRunnerSettings.findById(AI_RUNNER_SETTINGS_ID);
  if (existing) {
    return mapSettings(existing);
  }

  const created = await AIRunnerSettings.create({ _id: AI_RUNNER_SETTINGS_ID });
  return mapSettings(created);
}

export async function updateAIRunnerSettings(input: {
  schedulesGloballyEnabled?: boolean;
  autoflowMode?: 'sequential' | 'parallel';
  artifactBaseDir?: string;
  mongoRetentionDays?: number;
  artifactRetentionDays?: number;
}): Promise<AIRunnerSettingsDTO> {
  await connectDB();
  const $set: Record<string, unknown> = {};
  if (typeof input.schedulesGloballyEnabled === 'boolean') {
    $set.schedulesGloballyEnabled = input.schedulesGloballyEnabled;
  }
  if (input.autoflowMode) {
    $set.autoflowMode = input.autoflowMode;
  }
  if (typeof input.artifactBaseDir === 'string') {
    $set.artifactBaseDir = input.artifactBaseDir.trim();
  }
  if (typeof input.mongoRetentionDays === 'number') {
    $set.mongoRetentionDays = Math.floor(input.mongoRetentionDays);
  }
  if (typeof input.artifactRetentionDays === 'number') {
    $set.artifactRetentionDays = Math.floor(input.artifactRetentionDays);
  }

  const doc = await AIRunnerSettings.findOneAndUpdate(
    { _id: AI_RUNNER_SETTINGS_ID },
    {
      $set,
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  if (!doc) {
    throw new Error('Failed to update AI Runner settings');
  }

  return mapSettings(doc);
}
