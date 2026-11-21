import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlertDialog } from './AlertDialog';

describe('AlertDialog', () => {
  it('uses alertdialog semantics and initially focuses the cancel action', () => {
    render(
      <AlertDialog
        open
        onOpenChange={vi.fn()}
        title="Delete server"
        description="This cannot be undone"
        cancel={<button>Keep server</button>}
        action={<button>Delete server</button>}
      >
        <p>Server details</p>
      </AlertDialog>
    );

    expect(screen.getByRole('alertdialog', { name: 'Delete server' })).toHaveAccessibleDescription(
      'This cannot be undone'
    );
    expect(screen.getByRole('button', { name: 'Keep server' })).toHaveFocus();
  });
});
