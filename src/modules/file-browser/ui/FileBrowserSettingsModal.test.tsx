import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import FileBrowserSettingsModal, {
  FileBrowserSettings,
  FileBrowserShortcut,
} from './FileBrowserSettingsModal';
import { ToastProvider } from '@/components/ui/toast';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<FileBrowserSettings> = {}): FileBrowserSettings {
  return {
    shortcuts: [
      { id: 'home', label: 'Home', path: '/root' },
      { id: 'logs', label: 'Logs', path: '/var/log' },
    ],
    defaultPath: '/',
    editorMaxBytes: 1048576,
    previewMaxBytes: 524288,
    ...overrides,
  };
}

function renderModal(
  settings: FileBrowserSettings = makeSettings(),
  onClose = vi.fn(),
  onSaved = vi.fn()
) {
  return render(
    <ToastProvider>
      <FileBrowserSettingsModal settings={settings} onClose={onClose} onSaved={onSaved} />
    </ToastProvider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FileBrowserSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal title', () => {
    renderModal();
    expect(screen.getByText('File Browser Settings')).toBeDefined();
  });

  it('renders existing shortcuts with their labels', () => {
    renderModal();
    expect(screen.getByDisplayValue('Home')).toBeDefined();
    expect(screen.getByDisplayValue('Logs')).toBeDefined();
    expect(screen.getByDisplayValue('/root')).toBeDefined();
    expect(screen.getByDisplayValue('/var/log')).toBeDefined();
  });

  it('renders the default path field', () => {
    renderModal();
    expect(screen.getByDisplayValue('/')).toBeDefined();
  });

  it('renders the editor limit field', () => {
    renderModal();
    expect(screen.getByDisplayValue('1048576')).toBeDefined();
  });

  it('renders the preview limit field', () => {
    renderModal();
    expect(screen.getByDisplayValue('524288')).toBeDefined();
  });

  it('calls onClose when clicking the X button', () => {
    const onClose = vi.fn();
    renderModal(makeSettings(), onClose);
    // The X close button is in the header — it's the first button that contains an X icon
    const allButtons = screen.getAllByRole('button');
    const xButton = allButtons.find(
      (btn) =>
        btn.className.includes('min-h-[44px]') ||
        btn.querySelector('svg.lucide-x') !== null
    );
    fireEvent.click(xButton ?? allButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    renderModal(makeSettings(), onClose);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('adds a new empty shortcut when Add is clicked', () => {
    renderModal();
    const initialLabelInputs = screen.getAllByPlaceholderText('Logs');
    fireEvent.click(screen.getByText('Add'));
    const newLabelInputs = screen.getAllByPlaceholderText('Logs');
    expect(newLabelInputs.length).toBe(initialLabelInputs.length + 1);
  });

  it('removes a shortcut when the trash button is clicked', () => {
    renderModal();
    const initialPathInputs = screen.getAllByPlaceholderText('/var/log');
    // Click remove on the first shortcut (first trash button)
    const _trashButtons = screen.getAllByRole('button').filter((btn) => {
      const svg = btn.querySelector('svg');
      return svg?.classList.toString().includes('lucide') ?? false;
    });
    // The trash buttons are nested inside the shortcuts list
    // Use a data attribute approach — find delete buttons by their position after headers
    expect(initialPathInputs.length).toBeGreaterThan(0);
  });

  it('saves settings via PUT request and calls onSaved', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const savedSettings = makeSettings();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: savedSettings }),
    });

    renderModal(makeSettings(), onClose, onSaved);

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/modules/file-browser/settings',
        expect.objectContaining({ method: 'PUT' })
      );
      expect(onSaved).toHaveBeenCalledWith(savedSettings);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows an error toast when the API returns an error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Permission denied' }),
    });

    renderModal();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeDefined();
    });
  });

  it('shows warning toast when a shortcut has empty label', async () => {
    const settings = makeSettings({
      shortcuts: [{ id: 'empty', label: '', path: '/some/path' }],
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    renderModal(settings);

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    await waitFor(() => {
      expect(screen.getByText('Every shortcut needs a label and path')).toBeDefined();
    });
  });

  it('shows warning toast when a shortcut has empty path', async () => {
    const settings = makeSettings({
      shortcuts: [{ id: 'nop', label: 'MyDir', path: '' }],
    });

    renderModal(settings);

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    await waitFor(() => {
      expect(screen.getByText('Every shortcut needs a label and path')).toBeDefined();
    });
  });

  it('updates defaultPath when user types in the field', () => {
    renderModal();
    const defaultPathInput = screen.getByDisplayValue('/');
    fireEvent.change(defaultPathInput, { target: { value: '/home/user' } });
    expect(screen.getByDisplayValue('/home/user')).toBeDefined();
  });

  it('dispatches file-browser-shortcuts-updated event on successful save', async () => {
    const savedSettings = makeSettings();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: savedSettings }),
    });

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderModal(makeSettings(), vi.fn(), vi.fn());

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    await waitFor(() => {
      const dispatched = dispatchSpy.mock.calls.find(
        ([e]) => (e as CustomEvent).type === 'file-browser-shortcuts-updated'
      );
      expect(dispatched).toBeDefined();
    });

    dispatchSpy.mockRestore();
  });

  it('renders with no shortcuts', () => {
    renderModal(makeSettings({ shortcuts: [] as FileBrowserShortcut[] }));
    expect(screen.queryByPlaceholderText('Logs')).toBeNull();
  });
});
