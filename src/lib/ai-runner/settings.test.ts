/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import connectDB from '@/lib/db';
import AIRunnerSettings from '@/models/AIRunnerSettings';
import { getAIRunnerSettings, updateAIRunnerSettings } from './settings';

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models/AIRunnerSettings', () => ({
  default: {
    findById: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

type SettingsModelMock = {
  findById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findOneAndUpdate: ReturnType<typeof vi.fn>;
};

function settingsModel(): SettingsModelMock {
  return AIRunnerSettings as unknown as SettingsModelMock;
}

describe('ai-runner settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAIRunnerSettings', () => {
    it('returns an existing settings document mapped to the DTO shape', async () => {
      const updatedAt = new Date('2026-04-26T07:00:00.000Z');
      settingsModel().findById.mockResolvedValue({
        schedulesGloballyEnabled: false,
        autoflowMode: 'parallel',
        artifactBaseDir: '/tmp/ai-runner',
        mongoRetentionDays: 14,
        artifactRetentionDays: 45,
        updatedAt,
      });

      const result = await getAIRunnerSettings();

      expect(connectDB).toHaveBeenCalledOnce();
      expect(settingsModel().findById).toHaveBeenCalledWith('airunner-settings');
      expect(settingsModel().create).not.toHaveBeenCalled();
      expect(result).toEqual({
        schedulesGloballyEnabled: false,
        autoflowMode: 'parallel',
        artifactBaseDir: '/tmp/ai-runner',
        mongoRetentionDays: 14,
        artifactRetentionDays: 45,
        updatedAt: '2026-04-26T07:00:00.000Z',
      });
    });

    it('creates default settings when no document exists', async () => {
      settingsModel().findById.mockResolvedValue(null);
      settingsModel().create.mockResolvedValue({
        schedulesGloballyEnabled: true,
        autoflowMode: 'sequential',
        artifactBaseDir: '/tmp/default-ai-runner',
        mongoRetentionDays: 30,
        artifactRetentionDays: 90,
        updatedAt: '2026-04-26T07:15:00.000Z',
      });

      const result = await getAIRunnerSettings();

      expect(settingsModel().create).toHaveBeenCalledWith({ _id: 'airunner-settings' });
      expect(result).toEqual({
        schedulesGloballyEnabled: true,
        autoflowMode: 'sequential',
        artifactBaseDir: '/tmp/default-ai-runner',
        mongoRetentionDays: 30,
        artifactRetentionDays: 90,
        updatedAt: '2026-04-26T07:15:00.000Z',
      });
    });

    it('defaults missing settings fields defensively', async () => {
      settingsModel().findById.mockResolvedValue({
        updatedAt: undefined,
      });

      const result = await getAIRunnerSettings();

      expect(result).toEqual({
        schedulesGloballyEnabled: true,
        autoflowMode: 'sequential',
        artifactBaseDir: expect.stringContaining('.servermon/ai-runner'),
        mongoRetentionDays: 30,
        artifactRetentionDays: 90,
        updatedAt: undefined,
      });
    });

    it('normalizes non-parallel autoflow values to sequential', async () => {
      settingsModel().findById.mockResolvedValue({
        schedulesGloballyEnabled: true,
        autoflowMode: 'unexpected-mode',
      });

      const result = await getAIRunnerSettings();

      expect(result.autoflowMode).toBe('sequential');
    });
  });

  describe('updateAIRunnerSettings', () => {
    it('updates only supported fields and returns mapped settings', async () => {
      settingsModel().findOneAndUpdate.mockResolvedValue({
        schedulesGloballyEnabled: false,
        autoflowMode: 'parallel',
        artifactBaseDir: '/tmp/ai-runner',
        mongoRetentionDays: 10,
        artifactRetentionDays: 60,
        updatedAt: new Date('2026-04-26T07:30:00.000Z'),
      });

      const result = await updateAIRunnerSettings({
        schedulesGloballyEnabled: false,
        autoflowMode: 'parallel',
        artifactBaseDir: '/tmp/ai-runner',
        mongoRetentionDays: 10,
        artifactRetentionDays: 60,
      });

      expect(connectDB).toHaveBeenCalledOnce();
      expect(settingsModel().findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'airunner-settings' },
        {
          $set: {
            schedulesGloballyEnabled: false,
            autoflowMode: 'parallel',
            artifactBaseDir: '/tmp/ai-runner',
            mongoRetentionDays: 10,
            artifactRetentionDays: 60,
          },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        }
      );
      expect(result).toEqual({
        schedulesGloballyEnabled: false,
        autoflowMode: 'parallel',
        artifactBaseDir: '/tmp/ai-runner',
        mongoRetentionDays: 10,
        artifactRetentionDays: 60,
        updatedAt: '2026-04-26T07:30:00.000Z',
      });
    });

    it('allows partial updates without overwriting omitted fields', async () => {
      settingsModel().findOneAndUpdate.mockResolvedValue({
        schedulesGloballyEnabled: true,
        autoflowMode: 'sequential',
        artifactBaseDir: '/tmp/default-ai-runner',
        mongoRetentionDays: 30,
        artifactRetentionDays: 90,
      });

      const result = await updateAIRunnerSettings({
        autoflowMode: 'sequential',
      });

      expect(settingsModel().findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'airunner-settings' },
        {
          $set: {
            autoflowMode: 'sequential',
          },
        },
        expect.objectContaining({
          new: true,
          upsert: true,
        })
      );
      expect(result).toEqual({
        schedulesGloballyEnabled: true,
        autoflowMode: 'sequential',
        artifactBaseDir: '/tmp/default-ai-runner',
        mongoRetentionDays: 30,
        artifactRetentionDays: 90,
        updatedAt: undefined,
      });
    });

    it('throws when the database update does not return a document', async () => {
      settingsModel().findOneAndUpdate.mockResolvedValue(null);

      await expect(updateAIRunnerSettings({ schedulesGloballyEnabled: true })).rejects.toThrow(
        'Failed to update AI Runner settings'
      );
    });
  });
});
