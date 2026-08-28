import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { EnvVarsAddModal, type ScopeChoice } from './EnvVarsAddModal';

function EnvVarsAddModalHarness() {
  const [open, setOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [value, setValue] = useState('');
  const [scope, setScope] = useState<ScopeChoice>('user');

  return (
    <>
      <button onClick={() => setOpen(true)}>Add variable</button>
      {open ? (
        <EnvVarsAddModal
          keyName={keyName}
          onKeyNameChange={setKeyName}
          value={value}
          onValueChange={setValue}
          scope={scope}
          onScopeChange={setScope}
          saving={false}
          onSave={() => {}}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

describe('EnvVarsAddModal', () => {
  it('opens as a named dialog and focuses the variable name', () => {
    render(<EnvVarsAddModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Add variable' });

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Add variable' });
    expect(dialog).toHaveAccessibleDescription(
      'User scope is written to the OS user environment so a fresh terminal can see it with env.'
    );
    expect(within(dialog).getByLabelText('Name')).toHaveFocus();
    expect(within(dialog).getByRole('group', { name: 'Variable scope' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'user' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(trigger.closest('[inert]')).not.toBeNull();
  });

  it('closes with Escape and restores focus to its trigger', () => {
    render(<EnvVarsAddModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Add variable' });

    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
