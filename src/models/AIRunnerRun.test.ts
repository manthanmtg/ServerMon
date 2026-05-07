/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import AIRunnerRun from './AIRunnerRun';

describe('AIRunnerRun model', () => {
  it('does not define a TTL index that deletes run history', () => {
    const indexes = AIRunnerRun.schema.indexes() as Array<
      [Record<string, unknown>, { expireAfterSeconds?: number }]
    >;
    const ttlIndexes = indexes.filter((index) => typeof index[1]?.expireAfterSeconds === 'number');

    expect(ttlIndexes).toEqual([]);
  });
});
