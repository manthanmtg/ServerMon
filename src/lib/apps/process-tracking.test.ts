/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSetSpawnPending, mockTrackProcess, mockUntrackProcesses, mockLogWarn } = vi.hoisted(
  () => ({
    mockSetSpawnPending: vi.fn(),
    mockTrackProcess: vi.fn(),
    mockUntrackProcesses: vi.fn(),
    mockLogWarn: vi.fn(),
  })
);

vi.mock('./repositories/operation-repository', () => ({
  setAppOperationSpawnPending: mockSetSpawnPending,
  trackAppOperationProcess: mockTrackProcess,
  untrackAppOperationProcesses: mockUntrackProcesses,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: mockLogWarn, error: vi.fn(), debug: vi.fn() }),
}));

import type { CommandRunRequest, CommandRunner } from './deploy';
import {
  runWithOperationCommandTracking,
  wrapCommandRunnerWithProcessTracking,
} from './process-tracking';

const tracking = {
  operationId: 'op_1',
  workerId: 'worker-1',
  leaseGeneration: 3,
};

function makeRunner(
  result: { code: number; output: string },
  options: {
    onSpawn?: boolean;
    spawnInfo?: { pid: number; startTime: string | null };
  } = {}
): CommandRunner {
  return vi.fn(async (request: CommandRunRequest) => {
    if (options.onSpawn) {
      await request.onSpawn?.(options.spawnInfo ?? { pid: 4242, startTime: '567890' });
    }
    return result;
  });
}

describe('wrapCommandRunnerWithProcessTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetSpawnPending.mockResolvedValue(true);
    mockTrackProcess.mockResolvedValue(true);
    mockUntrackProcesses.mockResolvedValue(true);
  });

  it('passes commands through unchanged without an operation tracking context', async () => {
    const runner = makeRunner({ code: 0, output: 'ok' });
    const wrapped = wrapCommandRunnerWithProcessTracking(runner);

    const result = await wrapped({ command: 'pnpm build' });

    expect(result).toEqual({ code: 0, output: 'ok' });
    expect(runner).toHaveBeenCalledWith({ command: 'pnpm build' });
    expect(mockSetSpawnPending).not.toHaveBeenCalled();
    expect(mockTrackProcess).not.toHaveBeenCalled();
    expect(mockUntrackProcesses).not.toHaveBeenCalled();
  });

  it('marks spawn pending, tracks the spawned process, and clears state after completion', async () => {
    const runner = makeRunner({ code: 0, output: 'built' }, { onSpawn: true });
    const wrapped = wrapCommandRunnerWithProcessTracking(runner);

    await runWithOperationCommandTracking(tracking, () => wrapped({ command: 'pnpm build' }));

    expect(mockSetSpawnPending).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ ...tracking, pending: true })
    );
    expect(mockTrackProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        ...tracking,
        process: expect.objectContaining({
          pid: 4242,
          startTime: '567890',
          command: 'pnpm build',
          token: expect.any(String),
        }),
      })
    );
    expect(mockSetSpawnPending).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ ...tracking, pending: false })
    );
    expect(mockUntrackProcesses).toHaveBeenCalledWith(
      expect.objectContaining({
        ...tracking,
        token: mockTrackProcess.mock.calls[0][0].process.token,
      })
    );
    expect(mockSetSpawnPending).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ ...tracking, pending: false })
    );
  });

  it('clears tracking state even when the command never spawns', async () => {
    const runner = makeRunner({ code: 1, output: '' });
    const wrapped = wrapCommandRunnerWithProcessTracking(runner);

    await runWithOperationCommandTracking(tracking, () => wrapped({ command: 'pnpm build' }));

    expect(mockTrackProcess).not.toHaveBeenCalled();
    expect(mockSetSpawnPending).toHaveBeenCalledTimes(2);
    expect(mockSetSpawnPending).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ pending: true })
    );
    expect(mockSetSpawnPending).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pending: false })
    );
    expect(mockUntrackProcesses).toHaveBeenCalled();
  });

  it('continues command execution when tracking writes fail', async () => {
    mockSetSpawnPending.mockRejectedValue(new Error('db down'));
    mockTrackProcess.mockRejectedValue(new Error('db down'));
    mockUntrackProcesses.mockRejectedValue(new Error('db down'));
    const runner = makeRunner({ code: 0, output: 'built' }, { onSpawn: true });
    const wrapped = wrapCommandRunnerWithProcessTracking(runner);

    const result = await runWithOperationCommandTracking(tracking, () =>
      wrapped({ command: 'pnpm build' })
    );

    expect(result).toEqual({ code: 0, output: 'built' });
    expect(mockLogWarn).toHaveBeenCalled();
  });

  it('stores a null process start time when it cannot be read', async () => {
    const runner = makeRunner(
      { code: 0, output: 'built' },
      { onSpawn: true, spawnInfo: { pid: 4242, startTime: null } }
    );
    const wrapped = wrapCommandRunnerWithProcessTracking(runner);

    await runWithOperationCommandTracking(tracking, () => wrapped({ command: 'pnpm build' }));

    expect(mockTrackProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        process: expect.objectContaining({ startTime: '' }),
      })
    );
  });
});
