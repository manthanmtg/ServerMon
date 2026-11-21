import { fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useOverlayAccessibility } from './useOverlayAccessibility';

function Overlay({ onClose, dismissible = true }: { onClose: () => void; dismissible?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useOverlayAccessibility({
    open: true,
    containerRef,
    initialFocusRef: closeRef,
    dismissible,
    onEscape: onClose,
  });

  return createPortal(
    <div data-overlay-root>
      <div ref={containerRef} role="dialog" tabIndex={-1}>
        <button ref={closeRef} onClick={onClose}>
          Close
        </button>
        <button>First action</button>
      </div>
    </div>,
    document.body
  );
}

function OverlayHarness({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="page-content">
      <button onClick={() => setOpen(true)}>Open</button>
      {open && <Overlay dismissible={dismissible} onClose={() => setOpen(false)} />}
    </div>
  );
}

describe('useOverlayAccessibility', () => {
  it('moves focus inside, traps Tab in both directions, and restores the trigger', () => {
    render(<OverlayHarness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);

    const close = screen.getByRole('button', { name: 'Close' });
    const action = screen.getByRole('button', { name: 'First action' });
    expect(close).toHaveFocus();

    action.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(action).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  it('restores body scrolling and background attributes exactly', () => {
    document.body.style.overflow = 'clip';
    render(<OverlayHarness />);
    const pageContent = screen.getByTestId('page-content');
    const backgroundRoot = pageContent.parentElement!;
    backgroundRoot.setAttribute('aria-hidden', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(document.body.style.overflow).toBe('hidden');
    expect(backgroundRoot).toHaveAttribute('inert');
    expect(backgroundRoot).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(document.body.style.overflow).toBe('clip');
    expect(backgroundRoot).not.toHaveAttribute('inert');
    expect(backgroundRoot).toHaveAttribute('aria-hidden', 'false');
  });

  it('does not close a non-dismissible overlay with Escape', () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose} dismissible={false} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
