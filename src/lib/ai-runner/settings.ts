import connectDB from '@/lib/db';
import AIRunnerSettings from '@/models/AIRunnerSettings';
import type { AIRunnerSettingsDTO } from '@/modules/ai-runner/types';

const AI_RUNNER_SETTINGS_ID = 'airunner-settings';

function mapSettings(doc: {
  schedulesGloballyEnabled?: boolean;
  updatedAt?: Date | string;
}): AIRunnerSettingsDTO {
  return {
    schedulesGloballyEnabled: doc.schedulesGloballyEnabled ?? true,
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
  schedulesGloballyEnabled: boolean;
}): Promise<AIRunnerSettingsDTO> {
  await connectDB();
  const doc = await AIRunnerSettings.findOneAndUpdate(
    { _id: AI_RUNNER_SETTINGS_ID },
    {
      $set: {
        schedulesGloballyEnabled: input.schedulesGloballyEnabled,
      },
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
