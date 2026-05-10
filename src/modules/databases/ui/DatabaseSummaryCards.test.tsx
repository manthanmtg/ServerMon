import { describe, expect, it } from 'vitest';
import { deriveDatabaseSummary } from './DatabaseSummaryCards';

describe('deriveDatabaseSummary', () => {
  it('derives page summary counts in one reusable pass', () => {
    const summary = deriveDatabaseSummary([
      { status: 'running', publicRoute: false },
      { status: 'failed', publicRoute: true },
      { status: 'draft', publicRoute: false },
      { status: 'running', publicRoute: true },
    ]);

    expect(summary).toEqual({
      total: 4,
      running: 2,
      failed: 1,
      publicCount: 2,
    });
  });
});
