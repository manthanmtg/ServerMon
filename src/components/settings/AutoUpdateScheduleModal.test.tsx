import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { AutoUpdateScheduleModal } from './AutoUpdateScheduleModal';

function AutoUpdateScheduleModalHarness() {
  const [open, setOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    enabled: true,
    time: '02:00',
    timezone: 'Etc/UTC',
  });

  return (
    <>
      <button onClick={() => setOpen(true)}>Edit schedule</button>
      {open ? (
        <AutoUpdateScheduleModal
          scheduleForm={scheduleForm}
          setScheduleForm={setScheduleForm}
          title="ServerMon Auto-Update Schedule"
          enableLabel="Enable ServerMon app auto-update"
          onClose={() => setOpen(false)}
          onSave={() => {}}
          isSaving={false}
        />
      ) : null}
    </>
  );
}

describe('AutoUpdateScheduleModal', () => {
  it('uses the shared modal keyboard contract when editing an update schedule', () => {
    render(<AutoUpdateScheduleModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Edit schedule' });

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'ServerMon Auto-Update Schedule' });
    expect(dialog).toHaveAccessibleDescription(
      'This schedule checks upstream first, then launches update work detached through systemd.'
    );
    expect(within(dialog).getByLabelText('Enable ServerMon app auto-update')).toHaveFocus();
    expect(trigger.closest('[inert]')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(
      screen.queryByRole('dialog', { name: 'ServerMon Auto-Update Schedule' })
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
