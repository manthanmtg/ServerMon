import connectDB from '@/lib/db';
import AIRunnerSettings from '@/models/AIRunnerSettings';
import type { AIRunnerSettingsDTO } from '@/modules/ai-runner/types';

const AI_RUNNER_SETTINGS_ID = 'airunner-settings';

function mapSettings(doc: {
  schedulesGloballyEnabled?: boolean;
  autoflowMode?: 'sequential' | 'parallel';
  updatedAt?: Date | string;
}): AIRunnerSettingsDTO {
  return {
    schedulesGloballyEnabled: doc.schedulesGloballyEnabled ?? true,
    autoflowMode: doc.autoflowMode === 'parallel' ? 'parallel' : 'sequential',
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
}): Promise<AIRunnerSettingsDTO> {
  await connectDB();
  const $set: Record<string, unknown> = {};
  if (typeof input.schedulesGloballyEnabled === 'boolean') {
    $set.schedulesGloballyEnabled = input.schedulesGloballyEnabled;
  }
  if (input.autoflowMode) {
    $set.autoflowMode = input.autoflowMode;
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
