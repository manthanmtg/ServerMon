import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Drawer } from './Drawer';

function DrawerHarness({ side }: { side: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open details</button>
      <Drawer open={open} onOpenChange={setOpen} title="Run details" side={side}>
        <button>Rerun</button>
      </Drawer>
    </>
  );
}

describe('Drawer', () => {
  it.each([
    ['left', 'left-0'],
    ['right', 'right-0'],
  ] as const)('renders an accessible %s drawer', (side, expectedClass) => {
    render(<DrawerHarness side={side} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));
    const drawer = screen.getByRole('dialog', { name: 'Run details' });
    expect(drawer.className).toContain(expectedClass);
    expect(screen.getByRole('button', { name: 'Close Run details' })).toHaveFocus();
  });
});
