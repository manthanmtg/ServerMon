import { describe, expect, it } from 'vitest';
import type { InstallJob, JobStatus } from '../types';
import { summarizeInstallJobs } from './widgetStats';

function job(id: string, status: JobStatus): InstallJob {
  return {
    id,
    templateId: `template-${id}`,
    templateName: `Template ${id}`,
    methodId: 'shell',
    config: {},
    status,
    steps: [],
  };
}

describe('summarizeInstallJobs', () => {
  it('counts visible statuses and preserves the first three recent jobs', () => {
    const jobs = [
      job('1', 'running'),
      job('2', 'success'),
      job('3', 'failed'),
      job('4', 'cancelled'),
      job('5', 'success'),
    ];

    expect(summarizeInstallJobs(jobs)).toEqual({
      recentJobs: jobs.slice(0, 3),
      successCount: 2,
      failedCount: 1,
      runningCount: 1,
    });
  });
});
