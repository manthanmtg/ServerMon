import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { OperationLogDialog } from './OperationLogDialog';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>View output</button>
      <OperationLogDialog
        open={open}
        onOpenChange={setOpen}
        title="Deployment logs"
        target="Git Portal"
        operationId="op-42"
        status="running"
        output={['building', 'starting']}
      />
    </>
  );
}

describe('OperationLogDialog', () => {
  it('shows full operation context and restores trigger focus', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'View output' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Deployment logs' })).toBeVisible();
    expect(screen.getByText('Git Portal')).toBeVisible();
    expect(screen.getByText('Operation op-42')).toBeVisible();
    expect(screen.getByText('Running')).toBeVisible();
    expect(screen.getByRole('log', { name: 'Deployment logs output' }).textContent).toBe(
      'building\nstarting'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close Deployment logs' }));
    expect(trigger).toHaveFocus();
  });
});
