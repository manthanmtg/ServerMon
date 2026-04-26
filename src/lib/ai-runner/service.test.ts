/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  AIRunnerService,
  getNextRunTimeFromExpression,
  resolveInvocationTemplate,
  shellEscape,
  stripAnsi,
} from './service';
import connectDB from '@/lib/db';
import AIRunnerProfile from '@/models/AIRunnerProfile';
import AIRunnerPrompt from '@/models/AIRunnerPrompt';
import AIRunnerSchedule from '@/models/AIRunnerSchedule';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerWorkspace from '@/models/AIRunnerWorkspace';
import { ensureAIRunnerSupervisor } from './processes';
import { enqueueRunRequest } from './queue';
import { getAIRunnerSettings, updateAIRunnerSettings } from './settings';
import * as shared from './shared';

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models/AIRunnerProfile');
vi.mock('@/models/AIRunnerPrompt');
vi.mock('@/models/AIRunnerSchedule');
vi.mock('@/models/AIRunnerRun');
vi.mock('@/models/AIRunnerWorkspace');
vi.mock('@/models/AIRunnerJob');

vi.mock('./processes', () => ({
  ensureAIRunnerSupervisor: vi.fn(),
}));

vi.mock('./queue', () => ({
  enqueueRunRequest: vi.fn(),
}));

vi.mock('./settings', () => ({
  getAIRunnerSettings: vi.fn(),
  updateAIRunnerSettings: vi.fn(),
}));

vi.mock('./execution', () => ({
  terminateAIRunnerExecution: vi.fn(),
}));

vi.mock('./shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shared')>();
  return {
    ...actual,
    validateProfileTemplate: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] }),
  };
});

describe('ai-runner service helpers', () => {
  it('strips ANSI escape sequences from output', () => {
    expect(stripAnsi('\u001b[32mgreen\u001b[0m')).toBe('green');
  });

  it('escapes shell content safely', () => {
    expect(shellEscape(`it's safe`)).toContain(`'it'"'"'s safe'`);
  });

  it('resolves prompt and working directory placeholders', () => {
    const command = resolveInvocationTemplate(
      'codex --cwd $WORKING_DIR "$PROMPT"',
      'Fix tests',
      '/srv/repo'
    );
    expect(command).toContain('Fix tests');
    expect(command).toContain('/srv/repo');
  });

  it('computes the next run time from a cron expression', () => {
    const next = getNextRunTimeFromExpression('0 9 * * 1-5', new Date('2026-04-20T10:00:00.000Z'));
    expect(next).toBeDefined();
  });
});

describe('AIRunnerService', () => {
  let service: AIRunnerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AIRunnerService({ autoStartSupervisor: false });
  });

  describe('Profiles', () => {
    it('lists profiles sorted by status and update time', async () => {
      const mockDocs = [
        { _id: '1', name: 'Profile 1', createdAt: new Date(), updatedAt: new Date() },
      ];
      (AIRunnerProfile.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockDocs),
      });

      const result = await service.listProfiles();
      expect(connectDB).toHaveBeenCalled();
      expect(AIRunnerProfile.find).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Profile 1');
    });

    it('gets a single profile by id', async () => {
      const mockDoc = { _id: '1', name: 'Profile 1', createdAt: new Date(), updatedAt: new Date() };
      (AIRunnerProfile.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);

      const result = await service.getProfile('1');
      expect(result?.name).toBe('Profile 1');
    });

    it('creates a new profile after validation', async () => {
      const input = {
        name: 'New',
        invocationTemplate: 'test $PROMPT',
        shell: '/bin/sh',
      } as unknown as Parameters<AIRunnerService['createProfile']>[0];
      const mockDoc = { _id: '1', ...input, createdAt: new Date(), updatedAt: new Date() };
      (AIRunnerProfile.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);

      const result = await service.createProfile(input);
      expect(shared.validateProfileTemplate).toHaveBeenCalled();
      expect(AIRunnerProfile.create).toHaveBeenCalledWith(input);
      expect(result.name).toBe('New');
    });

    it('updates an existing profile', async () => {
      const existing = {
        _id: '1',
        name: 'Old',
        invocationTemplate: 'old',
        shell: 'sh',
        save: vi.fn().mockResolvedValue(true),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (AIRunnerProfile.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      const result = await service.updateProfile('1', { name: 'Updated' });
      expect(existing.name).toBe('Updated');
      expect(existing.save).toHaveBeenCalled();
      expect(result?.name).toBe('Updated');
    });

    it('deletes a profile if not in use', async () => {
      (AIRunnerSchedule.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      (AIRunnerProfile.findByIdAndDelete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: '1',
      });

      const result = await service.deleteProfile('1');
      expect(result).toBe(true);
      expect(AIRunnerProfile.findByIdAndDelete).toHaveBeenCalledWith('1');
    });

    it('throws error when deleting a profile in use', async () => {
      (AIRunnerSchedule.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      await expect(service.deleteProfile('1')).rejects.toThrow('referenced by schedules');
    });

    it('pauses linked schedules when force deleting a profile in use', async () => {
      (AIRunnerSchedule.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(2);
      (AIRunnerSchedule.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        modifiedCount: 2,
      });
      (AIRunnerProfile.findByIdAndDelete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: '1',
      });

      const result = await service.deleteProfile('1', { force: true });

      expect(result).toBe(true);
      expect(AIRunnerSchedule.updateMany).toHaveBeenCalledWith(
        { agentProfileId: '1' },
        { $set: { enabled: false }, $unset: { nextRunTime: '' } }
      );
      expect(AIRunnerProfile.findByIdAndDelete).toHaveBeenCalledWith('1');
    });
  });

  describe('Prompts', () => {
    it('lists prompts', async () => {
      (AIRunnerPrompt.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockResolvedValue([]),
      });
      await service.listPrompts();
      expect(AIRunnerPrompt.find).toHaveBeenCalled();
    });

    it('creates a prompt', async () => {
      const input = {
        name: 'Prompt',
        content: 'content',
        type: 'inline',
      } as unknown as Parameters<AIRunnerService['createPrompt']>[0];
      (AIRunnerPrompt.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: '1',
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await service.createPrompt(input);
      expect(result.name).toBe('Prompt');
    });

    it('pauses linked schedules when force deleting a prompt in use', async () => {
      (AIRunnerSchedule.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      (AIRunnerSchedule.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        modifiedCount: 1,
      });
      (AIRunnerPrompt.findByIdAndDelete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: 'prompt-1',
      });

      const result = await service.deletePrompt('prompt-1', { force: true });

      expect(result).toBe(true);
      expect(AIRunnerSchedule.updateMany).toHaveBeenCalledWith(
        { promptId: 'prompt-1' },
        { $set: { enabled: false }, $unset: { nextRunTime: '' } }
      );
      expect(AIRunnerPrompt.findByIdAndDelete).toHaveBeenCalledWith('prompt-1');
    });
  });

  describe('Schedules', () => {
    it('lists schedules with filters', async () => {
      const mockQuery = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((onFulfilled) => {
          return Promise.resolve(onFulfilled([]));
        }),
      };

      (AIRunnerSchedule.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);
      await service.listSchedules({ enabled: true, limit: 10 });
      expect(AIRunnerSchedule.find).toHaveBeenCalledWith({ enabled: true });
    });

    it('toggles a schedule', async () => {
      const mockSchedule = {
        _id: '1',
        enabled: true,
        cronExpression: '* * * * *',
        save: vi.fn().mockResolvedValue(true),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (AIRunnerSchedule.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSchedule
      );

      await service.toggleSchedule('1');
      expect(mockSchedule.enabled).toBe(false);
      expect(mockSchedule.save).toHaveBeenCalled();
      expect(ensureAIRunnerSupervisor).toHaveBeenCalled();
    });

    it('does not enable a schedule when its prompt was deleted', async () => {
      const mockSchedule = {
        _id: 'schedule-1',
        promptId: 'missing-prompt',
        agentProfileId: 'profile-1',
        enabled: false,
        cronExpression: '* * * * *',
        save: vi.fn().mockResolvedValue(true),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (AIRunnerSchedule.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSchedule
      );
      (AIRunnerPrompt.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.toggleSchedule('schedule-1')).rejects.toThrow('Prompt is not available');

      expect(mockSchedule.save).not.toHaveBeenCalled();
      expect(ensureAIRunnerSupervisor).not.toHaveBeenCalled();
    });

    it('does not enable a schedule when its profile was deleted', async () => {
      const mockSchedule = {
        _id: 'schedule-1',
        promptId: 'prompt-1',
        agentProfileId: 'missing-profile',
        enabled: false,
        cronExpression: '* * * * *',
        save: vi.fn().mockResolvedValue(true),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (AIRunnerSchedule.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSchedule
      );
      (AIRunnerPrompt.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: 'prompt-1',
      });
      (AIRunnerProfile.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.toggleSchedule('schedule-1')).rejects.toThrow(
        'Profile is not available'
      );

      expect(mockSchedule.save).not.toHaveBeenCalled();
      expect(ensureAIRunnerSupervisor).not.toHaveBeenCalled();
    });

    it('returns persisted runner settings', async () => {
      (getAIRunnerSettings as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        schedulesGloballyEnabled: false,
      });

      const result = await service.getSettings();

      expect(result.schedulesGloballyEnabled).toBe(false);
      expect(getAIRunnerSettings).toHaveBeenCalled();
    });

    it('updates persisted runner settings', async () => {
      (updateAIRunnerSettings as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        schedulesGloballyEnabled: false,
      });

      const result = await service.updateSettings({ schedulesGloballyEnabled: false });

      expect(result.schedulesGloballyEnabled).toBe(false);
      expect(updateAIRunnerSettings).toHaveBeenCalledWith({
        schedulesGloballyEnabled: false,
      });
      expect(ensureAIRunnerSupervisor).toHaveBeenCalled();
    });
  });

  describe('Workspaces', () => {
    it('pauses linked schedules when force deleting a workspace in use', async () => {
      (AIRunnerSchedule.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      (AIRunnerRun.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      (AIRunnerSchedule.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        modifiedCount: 1,
      });
      (
        AIRunnerWorkspace.findByIdAndDelete as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        _id: 'workspace-1',
      });

      const result = await service.deleteWorkspace('workspace-1', { force: true });

      expect(result).toBe(true);
      expect(AIRunnerSchedule.updateMany).toHaveBeenCalledWith(
        { workspaceId: 'workspace-1' },
        { $set: { enabled: false }, $unset: { nextRunTime: '' } }
      );
      expect(AIRunnerWorkspace.findByIdAndDelete).toHaveBeenCalledWith('workspace-1');
    });

    it('does not force delete a workspace with active runs', async () => {
      (AIRunnerSchedule.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      (AIRunnerRun.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      await expect(service.deleteWorkspace('workspace-1', { force: true })).rejects.toThrow(
        'active runs'
      );

      expect(AIRunnerSchedule.updateMany).not.toHaveBeenCalled();
      expect(AIRunnerWorkspace.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });

  describe('Runs', () => {
    it('lists runs with pagination and search', async () => {
      const mockRuns = [
        {
          _id: '1',
          status: 'completed',
          createdAt: new Date(),
          updatedAt: new Date(),
          queuedAt: new Date(),
        },
      ];
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((onFulfilled) => {
          return Promise.resolve(onFulfilled(mockRuns));
        }),
      };

      (AIRunnerRun.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);
      (AIRunnerRun.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await service.listRuns({ search: 'test', limit: 10, offset: 0 });
      expect(result.runs).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('executes a run by enqueuing a request', async () => {
      const request = { content: 'test', type: 'inline' } as unknown as Parameters<
        AIRunnerService['executeRun']
      >[0];
      (enqueueRunRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: 'run-1',
      });

      const result = await service.executeRun(request);
      expect(enqueueRunRequest).toHaveBeenCalledWith(request);
      expect(ensureAIRunnerSupervisor).toHaveBeenCalled();
      expect(result).toEqual({ _id: 'run-1' });
    });
  });

  describe('Directories', () => {
    it('lists known directories from schedules and runs', async () => {
      (AIRunnerSchedule.distinct as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
        '/dir1',
      ]);
      (AIRunnerRun.distinct as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(['/dir2']);
      (AIRunnerWorkspace.distinct as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
        '/dir0',
      ]);

      const result = await service.listKnownDirectories();
      expect(result.directories).toContain('/dir1');
      expect(result.directories).toContain('/dir2');
      expect(result.directories).toContain(process.cwd());
    });
  });
});
