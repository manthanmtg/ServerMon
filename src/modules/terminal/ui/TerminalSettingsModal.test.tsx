import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

const mockToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import TerminalSettingsModal from './TerminalSettingsModal';

const defaultSettings = {
  idleTimeoutMinutes: 30,
  maxSessions: 5,
  fontSize: 14,
  loginAsUser: 'root',
  defaultDirectory: '/home',
};

describe('TerminalSettingsModal', () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: defaultSettings }),
    });
  });

  it('renders modal title', () => {
    render(
      <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByText('Terminal Settings')).toBeDefined();
  });

  it('renders all setting fields with current values', () => {
    render(
      <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByDisplayValue('30')).toBeDefined(); // idleTimeout
    expect(screen.getByDisplayValue('5')).toBeDefined(); // maxSessions
    expect(screen.getByDisplayValue('14')).toBeDefined(); // fontSize
    expect(screen.getByDisplayValue('root')).toBeDefined();
    expect(screen.getByDisplayValue('/home')).toBeDefined();
  });

  it('renders setting labels and descriptions', () => {
    render(
      <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByText('Idle timeout')).toBeDefined();
    expect(screen.getByText('Max sessions')).toBeDefined();
    expect(screen.getByText('Font size')).toBeDefined();
    expect(screen.getByText('Login as user')).toBeDefined();
    expect(screen.getByText('Default directory')).toBeDefined();
  });

  it('calls onClose when Cancel is clicked', () => {
    render(
      <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    render(
      <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    // Click the outer div which has onClick={onClose}
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button clicked', () => {
    render(
      <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    // The X button is the one inside the header
    const buttons = screen.getAllByRole('button');
    const xButton = buttons.find((b) => b.querySelector('svg'));
    if (xButton) fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('updates idle timeout when input changes', () => {
    render(
      <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    const input = screen.getByDisplayValue('30');
    fireEvent.change(input, { target: { value: '60' } });
    expect(screen.getByDisplayValue('60')).toBeDefined();
  });

  it('updates max sessions when input changes', () => {
    render(
      <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    const input = screen.getByDisplayValue('5');
    fireEvent.change(input, { target: { value: '10' } });
    expect(screen.getByDisplayValue('10')).toBeDefined();
  });

  it('updates loginAsUser when input changes', () => {
    render(
      <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    const input = screen.getByDisplayValue('root');
    fireEvent.change(input, { target: { value: 'ubuntu' } });
    expect(screen.getByDisplayValue('ubuntu')).toBeDefined();
  });

  it('calls onSaved and onClose on successful save', async () => {
    await act(async () => {
      render(
        <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(defaultSettings);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('sends PUT request with form data on save', async () => {
    await act(async () => {
      render(
        <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/terminal/settings',
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  it('shows error toast when save fails with API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid settings' }),
    });
    await act(async () => {
      render(
        <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Invalid settings', variant: 'destructive' })
      );
    });
  });

  it('shows error toast when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(
        <TerminalSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Network error', variant: 'destructive' })
      );
    });
  });
});
