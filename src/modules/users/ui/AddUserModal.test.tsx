import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AddUserModal from './AddUserModal';

describe('AddUserModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  const renderModal = (isOpen = true) => {
    return render(<AddUserModal isOpen={isOpen} onClose={mockOnClose} onSuccess={mockOnSuccess} />);
  };

  it('does not render when isOpen is false', () => {
    renderModal(false);
    expect(screen.queryByText('Add OS User')).toBeNull();
  });

  it('renders when isOpen is true', () => {
    renderModal(true);
    expect(screen.getByText('Add OS User')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. jdoe')).toBeDefined();
  });

  it('handles input changes', () => {
    renderModal();
    const usernameInput = screen.getByPlaceholderText('e.g. jdoe') as HTMLInputElement;
    const shellSelect = screen.getByRole('combobox') as HTMLSelectElement;

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(shellSelect, { target: { value: '/bin/zsh' } });

    expect(usernameInput.value).toBe('testuser');
    expect(shellSelect.value).toBe('/bin/zsh');
  });

  it('handles successful form submission', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'success' }),
    } as Response);

    renderModal();
    const usernameInput = screen.getByPlaceholderText('e.g. jdoe');
    const submitButton = screen.getByText('Create User');

    fireEvent.change(usernameInput, { target: { value: 'newuser' } });

    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'os', username: 'newuser', shell: '/bin/bash' }),
      })
    );

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('handles submission error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'User already exists' }),
    } as Response);

    renderModal();
    const usernameInput = screen.getByPlaceholderText('e.g. jdoe');
    const submitButton = screen.getByText('Create User');

    fireEvent.change(usernameInput, { target: { value: 'existinguser' } });

    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(screen.getByText('User already exists')).toBeDefined();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('calls onClose when clicking cancel or close button', () => {
    renderModal();
    const cancelButton = screen.getByText('Cancel');

    fireEvent.click(cancelButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);

    // Click the backdrop (simulated by finding the absolute div with onClick)
    // Actually simpler to just click the X button if we can find it
    // The X icon button is the last button in the component
    const buttons = screen.getAllByRole('button');
    const xButton = buttons[buttons.length - 1];
    fireEvent.click(xButton);
    expect(mockOnClose).toHaveBeenCalledTimes(2);
  });
});
