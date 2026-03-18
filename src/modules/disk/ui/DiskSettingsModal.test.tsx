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

  it('calls onClose when X button is clicked', () => {
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    // The close button is a ghost/icon button (no text) — find it by excluding the setting buttons
    const allButtons = screen.getAllByRole('button');
    const closeButton = allButtons.find(
      (btn) => !btn.textContent?.includes('Binary') && !btn.textContent?.includes('Decimal')
    )!;
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls fetch with binary unit when binary button is clicked', async () => {
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    const binaryButton = screen.getByText('Binary (base 1024)').closest('button')!;
    await act(async () => {
      fireEvent.click(binaryButton);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/disk/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ unitSystem: 'binary' }),
      })
    );
  });

  it('calls fetch with decimal unit when decimal button is clicked', async () => {
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    const decimalButton = screen.getByText('Decimal (base 1000)').closest('button')!;
    await act(async () => {
      fireEvent.click(decimalButton);
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
    const decimalButton = screen.getByText('Decimal (base 1000)').closest('button')!;
    await act(async () => {
      fireEvent.click(decimalButton);
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedSettings));
  });

  it('does not call onSaved when response has no settings', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    const binaryButton = screen.getByText('Binary (base 1024)').closest('button')!;
    await act(async () => {
      fireEvent.click(binaryButton);
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('handles fetch error gracefully without crashing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<DiskSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />);
    const binaryButton = screen.getByText('Binary (base 1024)').closest('button')!;
    await act(async () => {
      fireEvent.click(binaryButton);
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
    const binaryButton = screen.getByText('Binary (base 1024)').closest('button')!;
    act(() => {
      fireEvent.click(binaryButton);
    });
    await waitFor(() => expect(screen.getByText('Saving...')).toBeDefined());
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ settings: defaultSettings }) });
    });
  });

  it('initialises with decimal selected when settings.unitSystem is decimal', () => {
    render(
      <DiskSettingsModal
        settings={{ unitSystem: 'decimal' }}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
    // The decimal button should be in active (selected) state; check by aria or class
    const decimalButton = screen.getByText('Decimal (base 1000)').closest('button')!;
    expect(decimalButton.className).toContain('border-primary');
  });
});
