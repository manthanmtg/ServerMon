import { randomUUID } from 'node:crypto';
import { createLogger } from '@/lib/logger';
import type { InstallJob, InstallRequest, JobStatus } from '../types';
import { getTemplateById } from '../templates';
import { runProvisionPipeline, rollbackPipeline } from './provisioner';

const log = createLogger('self-service:job-manager');

const jobs = new Map<string, InstallJob>();

const MAX_JOBS = 100;

function pruneOldJobs(): void {
  if (jobs.size <= MAX_JOBS) return;
  const sorted = [...jobs.values()].sort((a, b) => {
    const aTime = a.completedAt || a.startedAt || '';
    const bTime = b.completedAt || b.startedAt || '';
    return aTime.localeCompare(bTime);
  });
  const toRemove = sorted.slice(0, jobs.size - MAX_JOBS);
  for (const job of toRemove) {
    jobs.delete(job.id);
  }
}

export function createJob(request: InstallRequest): InstallJob | { error: string } {
  const template = getTemplateById(request.templateId);
  if (!template) {
    return { error: `Template not found: ${request.templateId}` };
  }

  const method = template.installMethods.find((m) => m.id === request.methodId);
  if (!method) {
    return { error: `Install method not found: ${request.methodId}` };
  }

  const job: InstallJob = {
    id: randomUUID(),
    templateId: template.id,
    templateName: template.name,
    methodId: method.id,
    config: request.config,
    status: 'pending',
    steps: [],
  };

  jobs.set(job.id, job);
  pruneOldJobs();

  log.info(`Created job ${job.id} for ${template.name} (method: ${method.id})`);

  const onUpdate = (updatedJob: InstallJob) => {
    jobs.set(updatedJob.id, updatedJob);
  };

  runProvisionPipeline(template, method, request.config, job, onUpdate).catch((err: unknown) => {
    const error = err as { message?: string };
    log.error(`Job ${job.id} pipeline error`, err);
    job.status = 'failed';
    job.error = error.message || 'Unexpected pipeline error';
    job.completedAt = new Date().toISOString();
    jobs.set(job.id, job);
  });

  return job;
}

export function getJob(jobId: string): InstallJob | undefined {
  return jobs.get(jobId);
}

export function getAllJobs(): InstallJob[] {
  return [...jobs.values()].sort((a, b) => {
    const aTime = a.startedAt || '';
    const bTime = b.startedAt || '';
    return bTime.localeCompare(aTime);
  });
}

export function getJobsByStatus(status: JobStatus): InstallJob[] {
  return getAllJobs().filter((j) => j.status === status);
}

export function cancelJob(jobId: string): { success: boolean; error?: string } {
  const job = jobs.get(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }
  if (job.status !== 'pending' && job.status !== 'running') {
    return { success: false, error: `Cannot cancel job in status: ${job.status}` };
  }

  job.status = 'cancelled';
  job.completedAt = new Date().toISOString();
  jobs.set(jobId, job);
  log.info(`Job ${jobId} cancelled`);
  return { success: true };
}

export function rollbackJob(jobId: string): { success: boolean; error?: string } {
  const job = jobs.get(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  const template = getTemplateById(job.templateId);
  if (!template) {
    return { success: false, error: 'Template not found for rollback' };
  }

  const completedSteps = job.steps.filter((s) => s.status === 'success').map((s) => s.step);

  if (completedSteps.length === 0) {
    return { success: false, error: 'No completed steps to rollback' };
  }

  job.status = 'rolling-back';
  jobs.set(jobId, job);

  const onLog = (line: string) => {
    log.info(`[rollback:${jobId}] ${line}`);
  };

  rollbackPipeline(template, job.config, completedSteps, onLog)
    .then(() => {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      jobs.set(jobId, job);
      log.info(`Job ${jobId} rollback completed`);
    })
    .catch((err: unknown) => {
      const error = err as { message?: string };
      log.error(`Job ${jobId} rollback failed`, err);
      job.status = 'failed';
      job.error = `Rollback failed: ${error.message || 'unknown'}`;
      jobs.set(jobId, job);
    });

  return { success: true };
}
