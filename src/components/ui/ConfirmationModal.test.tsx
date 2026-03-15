import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ConfirmationModal from './ConfirmationModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  isOpen: true,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  title: 'Delete Server',
  message: 'Are you sure you want to delete this server?',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConfirmationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    render(<ConfirmationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the modal when isOpen is true', () => {
    render(<ConfirmationModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Delete Server')).toBeDefined();
    expect(screen.getByText('Are you sure you want to delete this server?')).toBeDefined();
  });

  it('renders the description when provided', () => {
    render(<ConfirmationModal {...defaultProps} description="Extra context here" />);
    expect(screen.getByText('Extra context here')).toBeDefined();
  });

  it('does not render description when not provided', () => {
    render(<ConfirmationModal {...defaultProps} />);
    expect(screen.queryByText('Extra context here')).toBeNull();
  });

  it('calls onCancel when the backdrop is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);
    // The backdrop is the first sibling inside the container
    const backdrop = document.querySelector('.absolute.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when the close (X) button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm when Confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('uses custom confirmLabel and cancelLabel', () => {
    render(
      <ConfirmationModal {...defaultProps} confirmLabel="Yes, delete" cancelLabel="No, keep" />
    );
    expect(screen.getByText('Yes, delete')).toBeDefined();
    expect(screen.getByText('No, keep')).toBeDefined();
  });

  it('calls onCancel on Escape key', () => {
    const onCancel = vi.fn();
    render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm on Enter key when not loading', () => {
    const onConfirm = vi.fn();
    render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} />);
    act(() => {
      fireEvent.keyDown(document, { key: 'Enter' });
    });
    expect(onConfirm).toHaveBeenCalled();
  });

  it('does NOT call onConfirm on Enter key when isLoading is true', () => {
    const onConfirm = vi.fn();
    render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} isLoading />);
    act(() => {
      fireEvent.keyDown(document, { key: 'Enter' });
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables confirm button when verificationText does not match', () => {
    render(<ConfirmationModal {...defaultProps} verificationText="delete" />);
    const confirmBtn = screen.getByText('Confirm').closest('button')!;
    expect(confirmBtn).toBeDisabled();
  });

  it('enables confirm button when verificationText matches input', () => {
    render(<ConfirmationModal {...defaultProps} verificationText="delete" />);
    const input = screen.getByPlaceholderText('delete');
    fireEvent.change(input, { target: { value: 'delete' } });
    const confirmBtn = screen.getByText('Confirm').closest('button')!;
    expect(confirmBtn).not.toBeDisabled();
  });

  it('shows the verification text prompt', () => {
    render(<ConfirmationModal {...defaultProps} verificationText="CONFIRM" />);
    expect(screen.getByText(/"CONFIRM"/)).toBeDefined();
  });

  it('applies danger variant by default', () => {
    render(<ConfirmationModal {...defaultProps} />);
    // Confirm button should be destructive variant
    const confirmBtn = screen.getByText('Confirm').closest('button')!;
    expect(confirmBtn.className).toContain('bg-destructive');
  });

  it('applies info variant icon and styling', () => {
    render(<ConfirmationModal {...defaultProps} variant="info" />);
    // Confirm button should be default variant (not destructive)
    const confirmBtn = screen.getByText('Confirm').closest('button')!;
    expect(confirmBtn.className).not.toContain('bg-destructive');
  });

  it('disables cancel button when isLoading', () => {
    render(<ConfirmationModal {...defaultProps} isLoading />);
    const cancelBtn = screen.getByText('Cancel').closest('button')!;
    expect(cancelBtn).toBeDisabled();
  });

  it('removes keyboard listeners when closed (isOpen becomes false)', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);

    // Close the modal
    rerender(<ConfirmationModal {...defaultProps} onCancel={onCancel} isOpen={false} />);

    // Pressing Escape should not trigger onCancel since modal is closed
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(onCancel).not.toHaveBeenCalled();
  });
});
