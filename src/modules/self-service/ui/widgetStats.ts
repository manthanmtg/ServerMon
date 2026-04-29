import type { InstallJob } from '../types';

export interface InstallJobSummary {
  recentJobs: InstallJob[];
  successCount: number;
  failedCount: number;
  runningCount: number;
}

export function summarizeInstallJobs(jobs: readonly InstallJob[]): InstallJobSummary {
  const recentJobs: InstallJob[] = [];
  let successCount = 0;
  let failedCount = 0;
  let runningCount = 0;

  for (const job of jobs) {
    if (recentJobs.length < 3) {
      recentJobs.push(job);
    }

    if (job.status === 'success') {
      successCount += 1;
    } else if (job.status === 'failed') {
      failedCount += 1;
    } else if (job.status === 'running') {
      runningCount += 1;
    }
  }

  return {
    recentJobs,
    successCount,
    failedCount,
    runningCount,
  };
}
