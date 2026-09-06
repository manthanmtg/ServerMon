import { describe, expect, it } from 'vitest';
import { nextRetryAt, shouldDeployCommit } from './auto-update-policy';

describe('auto update policy', () => {
  it('backs off once per failed attempt, then returns to the interval', () => {
    const now = new Date('2026-09-06T12:00:00Z');
    expect(
      [1, 2, 3, 4, 5].map(
        (count) => (nextRetryAt(now, count, 1440).getTime() - now.getTime()) / 60_000
      )
    ).toEqual([1, 5, 15, 60, 1440]);
    expect(nextRetryAt(now, 4, 5)).toEqual(new Date('2026-09-06T12:05:00Z'));
  });
  it('compares proven deployment identity and reconciles unknown versions', () => {
    expect(shouldDeployCommit('B', 'A')).toBe(true);
    expect(shouldDeployCommit('B', 'B')).toBe(false);
    expect(shouldDeployCommit('B')).toBe(true);
  });
});
