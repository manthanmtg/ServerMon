import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstallJob } from '../../types';
import { InstallProgress } from './InstallProgress';

const baseJob: InstallJob = {
  id: 'job-running',
  templateId: 'nginx',
  templateName: 'Nginx',
  methodId: 'package-manager',
  config: {},
  status: 'running',
  steps: [
    {
      step: 'install',
      label: 'Install service',
      status: 'running',
      logs: ['Downloading packages', 'Installing nginx'],
    },
  ],
};

function mockJob(job: InstallJob) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job }),
    })
  );
}

describe('InstallProgress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows shared live controls for the running step output', async () => {
    mockJob(baseJob);

    await act(async () =>
      render(<InstallProgress jobId="job-running" onDone={vi.fn()} onRollback={vi.fn()} />)
    );

    const output = await screen.findByRole('log', { name: 'Install service output' });
    expect(output).toHaveTextContent('Downloading packages');
    expect(screen.getByRole('button', { name: 'Follow live output' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Autoscroll output' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Wrap output' })).toBeDefined();
  });

  it('keeps completed output static and preserves the Done action', async () => {
    const onDone = vi.fn();
    mockJob({
      ...baseJob,
      id: 'job-success',
      status: 'success',
      steps: [{ ...baseJob.steps[0], status: 'success', logs: ['Install complete'] }],
    });

    await act(async () =>
      render(<InstallProgress jobId="job-success" onDone={onDone} onRollback={vi.fn()} />)
    );

    fireEvent.click(await screen.findByRole('button', { name: /Install service/ }));
    await waitFor(() =>
      expect(screen.getByRole('log', { name: 'Install service output' })).toHaveTextContent(
        'Install complete'
      )
    );
    expect(screen.queryByRole('button', { name: 'Follow live output' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Autoscroll output' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('preserves failed-step details and rollback', async () => {
    const onRollback = vi.fn();
    mockJob({
      ...baseJob,
      id: 'job-failed',
      status: 'failed',
      steps: [
        {
          ...baseJob.steps[0],
          status: 'failed',
          logs: ['Package manager exited 1'],
          error: 'Install failed',
        },
      ],
    });

    await act(async () =>
      render(<InstallProgress jobId="job-failed" onDone={vi.fn()} onRollback={onRollback} />)
    );

    fireEvent.click(await screen.findByRole('button', { name: /Install service/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Install failed');
    fireEvent.click(screen.getByRole('button', { name: 'Rollback' }));
    expect(onRollback).toHaveBeenCalledWith('job-failed');
  });
});
