import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_CONCURRENT_RUNS,
  MAX_CONCURRENT_RUNS_CAP,
  getMaxConcurrentRuns,
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
});
