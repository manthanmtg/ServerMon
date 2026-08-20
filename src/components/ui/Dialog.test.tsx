import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open settings</button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Settings"
        description="Configure this feature"
      >
        <button>Save settings</button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('renders a named portal dialog and restores focus when closed', () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole('button', { name: 'Open settings' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(dialog).toHaveAccessibleDescription('Configure this feature');
    expect(screen.getByRole('button', { name: 'Close Settings' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Close Settings' }));
    expect(trigger).toHaveFocus();
  });

  it('respects a non-dismissible dialog', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="Working" dismissible={false}>
        <p>Please wait</p>
      </Dialog>
    );

    expect(screen.queryByRole('button', { name: /Close/ })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId('dialog-backdrop'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
