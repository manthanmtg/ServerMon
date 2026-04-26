/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import type {
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerRunDTO,
  AIRunnerScheduleDTO,
  AIRunnerSettingsDTO,
} from './types';

describe('ai-runner type shapes', () => {
  it('captures profile configuration', () => {
    const profile: AIRunnerProfileDTO = {
      _id: 'profile-1',
      name: 'Codex',
      slug: 'codex',
      agentType: 'codex',
      invocationTemplate: 'codex "$PROMPT"',
      defaultTimeout: 30,
      maxTimeout: 120,
      shell: '/bin/bash',
      requiresTTY: false,
      env: {},
      enabled: true,
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:00:00.000Z',
    };
    expect(profile.agentType).toBe('codex');
    expect(profile.enabled).toBe(true);
  });

  it('captures prompt details and tags', () => {
    const prompt: AIRunnerPromptDTO = {
      _id: 'prompt-1',
      name: 'Nightly docs pass',
      content: 'Update stale docs',
      type: 'inline',
      tags: ['docs'],
      attachments: [],
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:00:00.000Z',
    };
    expect(prompt.tags).toContain('docs');
  });

  it('captures schedule timing data', () => {
    const schedule: AIRunnerScheduleDTO = {
      _id: 'schedule-1',
      name: 'Weekday polish',
      promptId: 'prompt-1',
      agentProfileId: 'profile-1',
      workingDirectory: '/srv/repo',
      timeout: 20,
      retries: 1,
      cronExpression: '0 9 * * 1-5',
      enabled: true,
      nextRunTime: '2026-04-21T03:30:00.000Z',
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:00:00.000Z',
    };
    expect(schedule.enabled).toBe(true);
    expect(schedule.cronExpression).toContain('1-5');
  });

  it('captures global scheduling settings', () => {
    const settings: AIRunnerSettingsDTO = {
      schedulesGloballyEnabled: false,
      autoflowMode: 'sequential',
      artifactBaseDir: '/var/lib/servermon/ai-runner',
      mongoRetentionDays: 30,
      artifactRetentionDays: 90,
      updatedAt: '2026-04-20T10:00:00.000Z',
    };
    expect(settings.schedulesGloballyEnabled).toBe(false);
  });

  it('captures run output and status', () => {
    const run: AIRunnerRunDTO = {
      _id: 'run-1',
      agentProfileId: 'profile-1',
      promptContent: 'Refactor tests',
      workingDirectory: '/srv/repo',
      command: 'codex ...',
      status: 'completed',
      stdout: 'Done',
      stderr: '',
      rawOutput: 'Done',
      queuedAt: '2026-04-20T09:59:30.000Z',
      scheduledFor: '2026-04-20T09:59:00.000Z',
      dispatchedAt: '2026-04-20T09:59:45.000Z',
      startedAt: '2026-04-20T10:00:00.000Z',
      finishedAt: '2026-04-20T10:02:00.000Z',
      durationSeconds: 120,
      triggeredBy: 'manual',
    };
    expect(run.status).toBe('completed');
    expect(run.triggeredBy).toBe('manual');
  });
});
