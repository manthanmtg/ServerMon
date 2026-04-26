import { createElement, type ImgHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RunDetailDrawer } from './RunDetailDrawer';
import type { AIRunnerRunDTO } from '../../types';

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) =>
    createElement('span', { 'data-next-image-alt': props.alt }),
}));

const baseRun: AIRunnerRunDTO = {
  _id: 'run-1',
  agentProfileId: 'profile-1',
  promptContent: 'Review the repo and report issues.',
  workingDirectory: '/root/repos/ServerMon',
  command: 'codex "$PROMPT"',
  status: 'running',
  stdout: 'clean output',
  stderr: '',
  rawOutput: 'raw output',
  queuedAt: '2026-04-21T17:59:35.000Z',
  startedAt: '2026-04-21T18:00:00.000Z',
  triggeredBy: 'manual',
};

describe('RunDetailDrawer', () => {
  it('shows a single output pane with autoscroll controls', () => {
    render(
      <RunDetailDrawer
        run={baseRun}
        historyDetailSection="output"
        onSectionChange={vi.fn()}
        onClose={vi.fn()}
        onRerun={vi.fn()}
        onKill={vi.fn()}
        onOpenPrompt={vi.fn()}
        onOpenSchedule={vi.fn()}
        getRunDisplayName={() => 'Test run'}
        profileName="Codex"
        promptSourceName="Inline prompt"
        scheduleName="Not scheduled"
      />
    );

    expect(screen.getByText('Captured output')).toBeInTheDocument();
    expect(screen.getByText('raw output')).toBeInTheDocument();
    expect(screen.queryByText('Clean output')).not.toBeInTheDocument();
    expect(screen.queryByText('Raw output')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Autoscroll:/i })).toBeInTheDocument();
  });

  it('toggles autoscroll state from the output toolbar', () => {
    render(
      <RunDetailDrawer
        run={baseRun}
        historyDetailSection="output"
        onSectionChange={vi.fn()}
        onClose={vi.fn()}
        onRerun={vi.fn()}
        onKill={vi.fn()}
        onOpenPrompt={vi.fn()}
        onOpenSchedule={vi.fn()}
        getRunDisplayName={() => 'Test run'}
        profileName="Codex"
        promptSourceName="Inline prompt"
        scheduleName="Not scheduled"
      />
    );

    const toggle = screen.getByRole('button', { name: /Autoscroll:/i });
    expect(toggle).toHaveTextContent('Autoscroll: ON');

    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('Autoscroll: OFF');
  });

  it('keeps section tabs and run actions in separate toolbar rows', () => {
    render(
      <RunDetailDrawer
        run={{ ...baseRun, promptId: 'prompt-1', scheduleId: 'schedule-1' }}
        historyDetailSection="summary"
        onSectionChange={vi.fn()}
        onClose={vi.fn()}
        onRerun={vi.fn()}
        onKill={vi.fn()}
        onOpenPrompt={vi.fn()}
        onOpenSchedule={vi.fn()}
        getRunDisplayName={() => 'Test run'}
        profileName="Codex"
        promptSourceName="Fix tests"
        scheduleName="Weekday run"
      />
    );

    const tabRow = screen.getByRole('button', { name: 'Summary' }).closest('[aria-label]');
    const actionRow = screen.getByRole('button', { name: 'Open Schedule' }).closest('[aria-label]');

    expect(tabRow).toHaveAttribute('aria-label', 'Run detail sections');
    expect(actionRow).toHaveAttribute('aria-label', 'Run detail actions');
    expect(actionRow).not.toBe(tabRow);
    expect(actionRow).toHaveClass('justify-end');
  });

  it('locks body scrolling while the drawer is open and restores it on close', () => {
    const originalOverflow = document.body.style.overflow;
    const { unmount } = render(
      <RunDetailDrawer
        run={baseRun}
        historyDetailSection="output"
        onSectionChange={vi.fn()}
        onClose={vi.fn()}
        onRerun={vi.fn()}
        onKill={vi.fn()}
        onOpenPrompt={vi.fn()}
        onOpenSchedule={vi.fn()}
        getRunDisplayName={() => 'Test run'}
        profileName="Codex"
        promptSourceName="Inline prompt"
        scheduleName="Not scheduled"
      />
    );

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe(originalOverflow);
  });

  it('shows the richer timing metadata for scheduled runs', () => {
    render(
      <RunDetailDrawer
        run={{
          ...baseRun,
          scheduleId: 'schedule-1',
          scheduledFor: '2026-04-21T17:59:00.000Z',
          queuedAt: '2026-04-21T17:59:00.000Z',
          dispatchedAt: '2026-04-21T18:36:45.000Z',
          lastError: 'Transient worker issue',
          triggeredBy: 'schedule',
        }}
        historyDetailSection="summary"
        onSectionChange={vi.fn()}
        onClose={vi.fn()}
        onRerun={vi.fn()}
        onKill={vi.fn()}
        onOpenPrompt={vi.fn()}
        onOpenSchedule={vi.fn()}
        getRunDisplayName={() => 'Test run'}
        profileName="Codex"
        promptSourceName="Inline prompt"
        scheduleName="Weekday run"
      />
    );

    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Weekday run')).toBeInTheDocument();
    expect(
      screen.getByText('Late dispatch usually means ServerMon was unavailable')
    ).toBeInTheDocument();
  });
});
