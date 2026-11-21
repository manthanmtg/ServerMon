import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DiskSettingsModal, { type DiskSettings } from './DiskSettingsModal';

describe('DiskSettingsModal', () => {
  const defaultSettings = { unitSystem: 'binary' as const };
  let onClose: () => void;
  let onSaved: (next: DiskSettings) => void;

  beforeEach(() => {
    onClose = vi.fn();
    onSaved = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: { unitSystem: 'binary' } }),
    });
  });

  it('renders the Disk Settings title', () => {
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    expect(screen.getByText('Disk Settings')).toBeDefined();
  });

  it('uses a labelled dialog and delegates Escape dismissal', () => {
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);

    expect(screen.getByRole('dialog', { name: 'Disk Settings' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close disk settings' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports failed saves and retains the persisted storage unit', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Settings update rejected' }),
    });

    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);

    const binary = screen.getByRole('radio', { name: /^Binary \(base 1024\)/ });
    const decimal = screen.getByRole('radio', { name: /^Decimal \(base 1000\)/ });
    expect(binary).toBeChecked();

    fireEvent.click(decimal);

    expect(await screen.findByRole('alert')).toHaveTextContent('Settings update rejected');
    expect(binary).toBeChecked();
    expect(decimal).not.toBeChecked();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('rejects invalid confirmed settings and retains the persisted storage unit', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: { unitSystem: 'invalid' } }),
    });

    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);

    const binary = screen.getByRole('radio', { name: /^Binary \(base 1024\)/ });
    fireEvent.click(screen.getByRole('radio', { name: /^Decimal \(base 1000\)/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save disk settings');
    expect(binary).toBeChecked();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('uses a generic error when the settings response is not JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });

    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('radio', { name: /^Decimal \(base 1000\)/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to save disk settings');
    expect(alert).not.toHaveTextContent('Unexpected token');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('renders Storage Units section', () => {
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    expect(screen.getByText('Storage Units')).toBeDefined();
  });

  it('renders Binary option', () => {
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    expect(screen.getByText('Binary (base 1024)')).toBeDefined();
    expect(screen.getByText('GiB, MiB, KiB')).toBeDefined();
  });

  it('renders Decimal option', () => {
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    expect(screen.getByText('Decimal (base 1000)')).toBeDefined();
    expect(screen.getByText('GB, MB, KB')).toBeDefined();
  });

  it('calls onClose when the close control is clicked', () => {
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close disk settings' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls fetch with binary unit when binary is selected', async () => {
    render(
      <DiskSettingsModal settings={{ unitSystem: 'decimal' }} onClose={onClose} onSaved={onSaved} />
    );
    const binaryOption = screen.getByRole('radio', { name: /^Binary \(base 1024\)/ });
    await act(async () => {
      fireEvent.click(binaryOption);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/disk/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ unitSystem: 'binary' }),
      })
    );
  });

  it('calls fetch with decimal unit when decimal is selected', async () => {
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    const decimalOption = screen.getByRole('radio', { name: /^Decimal \(base 1000\)/ });
    await act(async () => {
      fireEvent.click(decimalOption);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/disk/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ unitSystem: 'decimal' }),
      })
    );
  });

  it('calls onSaved with new settings after successful save', async () => {
    const savedSettings = { unitSystem: 'decimal' as const };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: savedSettings }),
    });
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    const decimalOption = screen.getByRole('radio', { name: /^Decimal \(base 1000\)/ });
    await act(async () => {
      fireEvent.click(decimalOption);
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedSettings));
  });

  it('does not call onSaved when response has no settings', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    const decimalOption = screen.getByRole('radio', { name: /^Decimal \(base 1000\)/ });
    await act(async () => {
      fireEvent.click(decimalOption);
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('handles fetch error gracefully without crashing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    const decimalOption = screen.getByRole('radio', { name: /^Decimal \(base 1000\)/ });
    await act(async () => {
      fireEvent.click(decimalOption);
    });
    // Should not throw; onSaved should not be called
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows saving spinner while request is in flight', async () => {
    let resolveFetch!: (v: unknown) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolveFetch = r;
        })
    );
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    const decimalOption = screen.getByRole('radio', { name: /^Decimal \(base 1000\)/ });
    act(() => {
      fireEvent.click(decimalOption);
    });
    await waitFor(() => expect(screen.getByText('Saving disk settings...')).toBeDefined());
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ settings: defaultSettings }) });
    });
  });

  it('initialises with decimal selected when settings.unitSystem is decimal', () => {
    render(
      <DiskSettingsModal settings={{ unitSystem: 'decimal' }} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByRole('radio', { name: /^Decimal \(base 1000\)/ })).toBeChecked();
  });
});
