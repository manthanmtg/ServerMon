import type { MutableRefObject } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryView } from './HistoryView';
import type { AIRunnerProfileDTO, AIRunnerRunDTO } from '../../types';

const profile: AIRunnerProfileDTO = {
  _id: 'profile-1',
  name: 'Codex',
  slug: 'codex',
  agentType: 'codex',
  invocationTemplate: 'codex "$PROMPT"',
  defaultTimeout: 30,
  maxTimeout: 120,
  shell: '/bin/bash',
  requiresTTY: false,
  env: {},
  enabled: true,
  locked: false,
  createdAt: '2026-04-21T00:00:00.000Z',
  updatedAt: '2026-04-21T00:00:00.000Z',
};

const run: AIRunnerRunDTO = {
  _id: 'run-1',
  agentProfileId: profile._id,
  promptContent: 'Review the deployment failure.',
  workingDirectory: '/srv/servermon',
  command: 'codex "$PROMPT"',
  status: 'failed',
  exitCode: 1,
  stdout: '',
  stderr: 'Failure details',
  rawOutput: 'Failure details',
  queuedAt: '2026-04-21T17:59:35.000Z',
  startedAt: '2026-04-21T18:00:00.000Z',
  triggeredBy: 'manual',
};

function renderHistory(openRunDetail = vi.fn()) {
  const historyRowRefs: MutableRefObject<Record<string, HTMLTableRowElement | null>> = {
    current: {},
  };

  render(
    <HistoryView
      runSearch=""
      setRunSearch={vi.fn()}
      historyStatusFilter="all"
      setHistoryStatusFilter={vi.fn()}
      historyTriggerFilter="all"
      setHistoryTriggerFilter={vi.fn()}
      historyProfileFilter="all"
      setHistoryProfileFilter={vi.fn()}
      historyScheduleFilter="all"
      setHistoryScheduleFilter={vi.fn()}
      profiles={[profile]}
      profileMap={{ [profile._id]: profile }}
      schedules={[]}
      filteredHistoryRuns={[run]}
      historyRowRefs={historyRowRefs}
      openRunDetail={openRunDetail}
      selectedRun={null}
      focusedHistoryRunId={null}
      loadAll={async () => {}}
      isActionPending={() => false}
      runExclusiveAction={async (_key, action) => action()}
      getRunDisplayName={() => 'Deployment review'}
      getRunContextLabel={() => 'Manual run'}
      promptMap={{}}
    />
  );

  return openRunDetail;
}

describe('HistoryView', () => {
  it('opens run details when Enter activates a history row', () => {
    const openRunDetail = renderHistory();
    const row = screen.getByText('Deployment review').closest('tr');

    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row!, { key: 'Enter' });

    expect(openRunDetail).toHaveBeenCalledWith(run);
  });

  it('opens run details without scrolling when Space activates a history row', () => {
    const openRunDetail = renderHistory();
    const row = screen.getByText('Deployment review').closest('tr');
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' });

    row!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(openRunDetail).toHaveBeenCalledWith(run);
  });
});
