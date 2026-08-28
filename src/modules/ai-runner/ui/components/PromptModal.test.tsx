import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { PromptFormState } from '../types';
import { emptyPromptForm } from '../utils';
import { PromptModal } from './PromptModal';

function PromptModalHarness() {
  const [open, setOpen] = useState(false);
  const [promptForm, setPromptForm] = useState<PromptFormState>(emptyPromptForm());

  return (
    <>
      <button onClick={() => setOpen(true)}>Create prompt</button>
      <PromptModal
        isOpen={open}
        onClose={() => setOpen(false)}
        editingPromptId={null}
        promptForm={promptForm}
        setPromptForm={setPromptForm}
        promptTemplates={[]}
        isSaving={false}
        onSave={async () => {}}
        onReset={() => setPromptForm(emptyPromptForm())}
        addAttachments={async () => {}}
        removeAttachment={() => {}}
      />
    </>
  );
}

describe('PromptModal', () => {
  it('opens as a named dialog and moves focus to the prompt name', () => {
    render(<PromptModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Create prompt' });

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Create prompt' });
    expect(dialog).toHaveAccessibleDescription(
      'Write the prompt once, tag it clearly, and keep it portable across runs and schedules.'
    );
    expect(within(dialog).getByLabelText('Name')).toHaveFocus();
    expect(trigger.closest('[inert]')).not.toBeNull();
  });

  it('closes with Escape and restores focus to the trigger', () => {
    render(<PromptModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Create prompt' });

    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Create prompt' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Create prompt' })).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
