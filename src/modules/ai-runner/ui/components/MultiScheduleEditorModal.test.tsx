import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { AIRunnerScheduleDTO } from '../../types';
import { MultiScheduleEditorModal } from './MultiScheduleEditorModal';

const schedules: AIRunnerScheduleDTO[] = [
  {
    _id: 'schedule-1',
    name: 'Nightly cleanup',
    promptId: 'prompt-1',
    agentProfileId: 'profile-1',
    workingDirectory: '/srv/servermon',
    timeout: 30,
    retries: 1,
    cronExpression: '0 2 * * *',
    enabled: true,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  },
];

function MultiScheduleEditorHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Edit multiple schedules</button>
      {open ? (
        <MultiScheduleEditorModal
          schedules={schedules}
          promptNames={{ 'prompt-1': 'Cleanup prompt' }}
          profileNames={{ 'profile-1': 'Codex' }}
          workspaceNames={{}}
          onClose={() => setOpen(false)}
          onSaved={async () => {}}
        />
      ) : null}
    </>
  );
}

describe('MultiScheduleEditorModal', () => {
  it('moves focus inside and isolates background content when opened', () => {
    render(<MultiScheduleEditorHarness />);
    const trigger = screen.getByRole('button', { name: 'Edit multiple schedules' });

    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('button', { name: 'Close multi schedule editor' })).toHaveFocus();
    expect(trigger.closest('[inert]')).not.toBeNull();
  });

  it('closes with Escape and restores focus to its trigger', () => {
    render(<MultiScheduleEditorHarness />);
    const trigger = screen.getByRole('button', { name: 'Edit multiple schedules' });

    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Multi Schedule Editor' })).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
