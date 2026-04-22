import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_CONCURRENT_RUNS,
  MAX_CONCURRENT_RUNS_CAP,
  getMaxConcurrentRuns,
  mapRun,
} from './shared';

describe('getMaxConcurrentRuns', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the default when the env var is unset', () => {
    delete process.env.AI_RUNNER_MAX_CONCURRENT_RUNS;
    expect(getMaxConcurrentRuns()).toBe(DEFAULT_MAX_CONCURRENT_RUNS);
  });

  it('uses the configured value when it is valid', () => {
    vi.stubEnv('AI_RUNNER_MAX_CONCURRENT_RUNS', '1');
    expect(getMaxConcurrentRuns()).toBe(1);
  });

  it('clamps invalid low values to 1', () => {
    vi.stubEnv('AI_RUNNER_MAX_CONCURRENT_RUNS', '0');
    expect(getMaxConcurrentRuns()).toBe(1);
  });

  it('caps high values to the supported maximum', () => {
    vi.stubEnv('AI_RUNNER_MAX_CONCURRENT_RUNS', '99');
    expect(getMaxConcurrentRuns()).toBe(MAX_CONCURRENT_RUNS_CAP);
  });

  it('falls back queuedAt from startedAt for legacy runs', () => {
    const startedAt = new Date('2026-04-22T08:00:00.000Z');
    const run = mapRun({
      _id: 'run-1',
      agentProfileId: 'profile-1',
      promptContent: 'Fix tests',
      workingDirectory: '/srv/repo',
      command: 'codex "$PROMPT"',
      status: 'completed',
      stdout: 'Done',
      stderr: '',
      rawOutput: 'Done',
      startedAt,
      triggeredBy: 'manual',
      createdAt: startedAt,
      updatedAt: startedAt,
    });

    expect(run.queuedAt).toBe(startedAt.toISOString());
    expect(run.startedAt).toBe(startedAt.toISOString());
  });
});
