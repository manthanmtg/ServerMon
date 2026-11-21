/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadFileSync } = vi.hoisted(() => ({ mockReadFileSync: vi.fn() }));

vi.mock('node:fs', () => ({ readFileSync: mockReadFileSync }));

import { isProcessGroupDead, readProcessStartTime } from './process-evidence';

function statWithStartTime(startTime: string) {
  return `12345 (sh) S 1 12345 12345 0 -1 4194560 100 0 0 0 1 0 0 0 20 0 1 0 ${startTime} 100000`;
}

describe('readProcessStartTime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses the starttime field after a comm value containing spaces', () => {
    mockReadFileSync.mockReturnValue(
      '12345 (sh -lc pnpm build) S 1 12345 12345 0 -1 4194560 100 0 0 0 1 0 0 0 20 0 1 0 567890 100000'
    );

    expect(readProcessStartTime(12345)).toBe('567890');
  });

  it('returns null for invalid pids and unreadable proc entries', () => {
    expect(readProcessStartTime(0)).toBeNull();
    expect(readProcessStartTime(-1)).toBeNull();
    expect(readProcessStartTime(1.5)).toBeNull();
    mockReadFileSync.mockReturnValue('garbage');
    expect(readProcessStartTime(1)).toBeNull();
    mockReadFileSync.mockReturnValue('1 (sh) S x');
    expect(readProcessStartTime(1)).toBeNull();
    mockReadFileSync.mockImplementation(() => {
      throw new Error('missing');
    });
    expect(readProcessStartTime(1)).toBeNull();
  });
});

describe('isProcessGroupDead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats invalid pids as dead', () => {
    expect(isProcessGroupDead(0)).toBe(true);
    expect(isProcessGroupDead(-5, '100')).toBe(true);
  });

  it('returns true when the process group no longer exists', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('no such process') as Error & { code: string };
      error.code = 'ESRCH';
      throw error;
    });

    expect(isProcessGroupDead(1234, '567890')).toBe(true);
  });

  it('treats an EPERM group as alive and unverifiable without a start time', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('operation not permitted') as Error & { code: string };
      error.code = 'EPERM';
      throw error;
    });

    expect(isProcessGroupDead(1234, '567890')).toBe(false);
    expect(isProcessGroupDead(1234)).toBe(false);
  });

  it('treats unknown kill errors as unverifiable', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(isProcessGroupDead(1234, '567890')).toBe(false);
  });

  it('detects pid reuse when the group leader has a different start time', () => {
    vi.spyOn(process, 'kill').mockReturnValue(true);
    mockReadFileSync.mockReturnValue(statWithStartTime('999999'));

    expect(isProcessGroupDead(1234, '567890')).toBe(true);
  });

  it('treats a matching start time as a live process group', () => {
    vi.spyOn(process, 'kill').mockReturnValue(true);
    mockReadFileSync.mockReturnValue(statWithStartTime('567890'));

    expect(isProcessGroupDead(1234, '567890')).toBe(false);
  });

  it('treats a missing recorded start time as unverifiable while the group exists', () => {
    vi.spyOn(process, 'kill').mockReturnValue(true);
    mockReadFileSync.mockReturnValue(statWithStartTime('567890'));

    expect(isProcessGroupDead(1234, '')).toBe(false);
    expect(isProcessGroupDead(1234, undefined)).toBe(false);
  });

  it('treats an unreadable group leader as unverifiable while the group exists', () => {
    vi.spyOn(process, 'kill').mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('leader exited');
    });

    expect(isProcessGroupDead(1234, '567890')).toBe(false);
  });
});
