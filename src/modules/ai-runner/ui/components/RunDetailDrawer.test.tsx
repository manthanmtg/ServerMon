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
});
