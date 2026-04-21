import { describe, expect, it } from 'vitest';
import type { AIRunnerScheduleDTO } from '../types';
import { buildScheduleVisualizationModel } from './scheduleVisualization';

const baseSchedule = {
  promptId: 'prompt-1',
  agentProfileId: 'profile-1',
  workingDirectory: '/root/repos/ServerMon',
  timeout: 30,
  retries: 1,
  enabled: true,
  createdAt: '2026-04-21T00:00:00.000Z',
  updatedAt: '2026-04-21T00:00:00.000Z',
} satisfies Omit<AIRunnerScheduleDTO, '_id' | 'name' | 'cronExpression'>;

describe('buildScheduleVisualizationModel', () => {
  it('marks a shared workspace as high risk when two schedules overlap', () => {
    const schedules: AIRunnerScheduleDTO[] = [
      {
        ...baseSchedule,
        _id: 'schedule-1',
        name: 'Morning audit',
        cronExpression: '0 9 * * *',
        nextRunTime: '2026-04-21T09:00:00.000Z',
      },
      {
        ...baseSchedule,
        _id: 'schedule-2',
        name: 'Morning fixer',
        cronExpression: '15 9 * * *',
        nextRunTime: '2026-04-21T09:15:00.000Z',
      },
    ];

    const model = buildScheduleVisualizationModel(
      schedules,
      new Date('2026-04-21T08:30:00.000Z').getTime()
    );

    expect(model.highRiskWorkspaceCount).toBe(1);
    expect(model.totalConflictCount).toBe(1);
    expect(model.workspaces[0]?.risk).toBe('high');
    expect(model.workspaces[0]?.conflicts[0]?.scheduleNames).toEqual([
      'Morning audit',
      'Morning fixer',
    ]);
  });

  it('detects self-overlap when interval is shorter than timeout', () => {
    const schedules: AIRunnerScheduleDTO[] = [
      {
        ...baseSchedule,
        _id: 'schedule-1',
        name: 'Repo pulse',
        cronExpression: '*/10 * * * *',
        timeout: 25,
        nextRunTime: '2026-04-21T09:00:00.000Z',
      },
    ];

    const model = buildScheduleVisualizationModel(
      schedules,
      new Date('2026-04-21T08:55:00.000Z').getTime()
    );

    expect(model.totalConflictCount).toBeGreaterThan(0);
    expect(model.workspaces[0]?.conflicts[0]?.kind).toBe('self-overlap');
    expect(model.workspaces[0]?.risk).toBe('high');
  });

  it('keeps a separated shared workspace at medium risk when no overlap is projected', () => {
    const schedules: AIRunnerScheduleDTO[] = [
      {
        ...baseSchedule,
        _id: 'schedule-1',
        name: 'Morning planner',
        cronExpression: '0 9 * * *',
        timeout: 15,
        nextRunTime: '2026-04-21T09:00:00.000Z',
      },
      {
        ...baseSchedule,
        _id: 'schedule-2',
        name: 'Evening planner',
        cronExpression: '0 17 * * *',
        timeout: 15,
        nextRunTime: '2026-04-21T17:00:00.000Z',
      },
    ];

    const model = buildScheduleVisualizationModel(
      schedules,
      new Date('2026-04-21T08:00:00.000Z').getTime()
    );

    expect(model.totalConflictCount).toBe(0);
    expect(model.workspaces[0]?.risk).toBe('medium');
    expect(model.workspaces[0]?.summary).toContain(
      'Multiple enabled schedules share this workspace'
    );
  });
});
