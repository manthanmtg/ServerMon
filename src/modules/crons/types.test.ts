/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type {
  CronSource,
  CronJob,
  CronLogEntry,
  SystemCronDir,
  CronsSnapshot,
  CronCreateRequest,
  CronRunStatus,
  CronUpdateRequest,
} from './types';

describe('crons type shapes', () => {
  it('CronSource accepts all valid values', () => {
    const sources: CronSource[] = [
      'user',
      'system',
      'etc-cron.d',
      'etc-cron.daily',
      'etc-cron.hourly',
      'etc-cron.weekly',
      'etc-cron.monthly',
    ];
    expect(sources).toHaveLength(7);
  });

  it('CronJob can be constructed with all required fields', () => {
    const job: CronJob = {
      id: 'job-1',
      minute: '0',
      hour: '2',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '*',
      command: '/usr/bin/backup.sh',
      expression: '0 2 * * *',
      user: 'root',
      source: 'user',
      enabled: true,
      nextRuns: ['2026-03-19T02:00:00Z'],
    };
    expect(job.id).toBe('job-1');
    expect(job.expression).toBe('0 2 * * *');
    expect(job.enabled).toBe(true);
    expect(job.nextRuns).toHaveLength(1);
  });

  it('CronJob optional fields can be omitted', () => {
    const job: CronJob = {
      id: 'job-2',
      minute: '*/15',
      hour: '*',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '*',
      command: 'echo hello',
      expression: '*/15 * * * *',
      user: 'ubuntu',
      source: 'system',
      enabled: true,
      nextRuns: [],
    };
    expect(job.comment).toBeUndefined();
    expect(job.sourceFile).toBeUndefined();
    expect(job.lastRun).toBeUndefined();
    expect(job.description).toBeUndefined();
  });

  it('CronLogEntry captures cron execution details', () => {
    const log: CronLogEntry = {
      timestamp: '2026-03-18T02:00:00Z',
      user: 'root',
      command: '/usr/bin/backup.sh',
      pid: 12345,
      message: 'backup completed',
    };
    expect(log.pid).toBe(12345);
    expect(log.user).toBe('root');
  });

  it('SystemCronDir captures directory info', () => {
    const dir: SystemCronDir = {
      name: 'cron.daily',
      path: '/etc/cron.daily',
      count: 5,
      scripts: ['aptitude', 'logrotate', 'man-db'],
    };
    expect(dir.count).toBe(5);
    expect(dir.scripts).toHaveLength(3);
  });

  it('CronsSnapshot wraps jobs, dirs, and summary', () => {
    const snapshot: CronsSnapshot = {
      source: 'crontab',
      crontabAvailable: true,
      summary: {
        total: 10,
        active: 8,
        disabled: 2,
        userCrons: 3,
        systemCrons: 7,
      },
      jobs: [],
      systemDirs: [],
      recentLogs: [],
      timestamp: '2026-03-18T00:00:00Z',
    };
    expect(snapshot.source).toBe('crontab');
    expect(snapshot.summary.total).toBe(10);
    expect(snapshot.crontabAvailable).toBe(true);
  });

  it('CronsSnapshot can include next run info in summary', () => {
    const snapshot: CronsSnapshot = {
      source: 'crontab',
      crontabAvailable: true,
      summary: {
        total: 1,
        active: 1,
        disabled: 0,
        userCrons: 1,
        systemCrons: 0,
        nextRunJob: 'backup',
        nextRunTime: '2026-03-19T02:00:00Z',
      },
      jobs: [],
      systemDirs: [],
      recentLogs: [],
      timestamp: '2026-03-18T00:00:00Z',
    };
    expect(snapshot.summary.nextRunJob).toBe('backup');
  });

  it('CronCreateRequest contains schedule fields', () => {
    const req: CronCreateRequest = {
      minute: '0',
      hour: '3',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '1',
      command: '/usr/bin/weekly-task.sh',
      comment: 'Weekly Monday task',
    };
    expect(req.command).toBe('/usr/bin/weekly-task.sh');
    expect(req.comment).toBe('Weekly Monday task');
  });

  it('CronRunStatus tracks execution lifecycle', () => {
    const status: CronRunStatus = {
      runId: 'run-1',
      jobId: 'job-1',
      command: 'echo hello',
      pid: 9999,
      status: 'completed',
      exitCode: 0,
      stdout: 'hello\n',
      stderr: '',
      startedAt: '2026-03-18T00:00:00Z',
      finishedAt: '2026-03-18T00:00:01Z',
    };
    expect(status.status).toBe('completed');
    expect(status.exitCode).toBe(0);
  });

  it('CronRunStatus status covers all states', () => {
    const states: CronRunStatus['status'][] = ['running', 'completed', 'failed'];
    expect(states).toHaveLength(3);
  });

  it('CronUpdateRequest only requires changed fields', () => {
    const partial: CronUpdateRequest = { enabled: false };
    expect(partial.enabled).toBe(false);
    expect(partial.command).toBeUndefined();
    expect(partial.minute).toBeUndefined();
  });
});
