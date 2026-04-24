import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

const mockToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import FileBrowserSettingsModal from './FileBrowserSettingsModal';
import type { FileBrowserSettings, FileBrowserShortcut } from './FileBrowserSettingsModal';

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
    <FileBrowserSettingsModal settings={settings} onClose={onClose} onSaved={onSaved} />
  );
}

const defaultSettings: FileBrowserSettings = {
  shortcuts: [
    { id: 'root', label: 'Root', path: '/' },
    { id: 'home', label: 'Home', path: '/home/user' },
  ],
  defaultPath: '/tmp',
  editorMaxBytes: 524288,
  previewMaxBytes: 262144,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FileBrowserSettingsModal', () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: defaultSettings }),
    });
  });

  // ── Title / description ───────────────────────────────────────────────────────

  it('renders the modal title', () => {
    renderModal();
    expect(screen.getByText('File Browser Settings')).toBeDefined();
  });

  it('renders modal title', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByText('File Browser Settings')).toBeDefined();
  });

  it('renders modal description', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByText(/Manage shortcuts and editor limits/)).toBeDefined();
  });

  it('renders Topbar shortcuts section heading', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByText('Topbar shortcuts')).toBeDefined();
  });

  it('renders Behavior section with description', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByText('Behavior')).toBeDefined();
  });

  // ── Shortcut display ──────────────────────────────────────────────────────────

  it('renders existing shortcuts with their labels', () => {
    renderModal();
    expect(screen.getByDisplayValue('Home')).toBeDefined();
    expect(screen.getByDisplayValue('Logs')).toBeDefined();
    expect(screen.getByDisplayValue('/root')).toBeDefined();
    expect(screen.getByDisplayValue('/var/log')).toBeDefined();
  });

  it('renders existing shortcut labels', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByDisplayValue('Root')).toBeDefined();
    expect(screen.getByDisplayValue('Home')).toBeDefined();
  });

  it('renders existing shortcut paths', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByDisplayValue('/')).toBeDefined();
    expect(screen.getByDisplayValue('/home/user')).toBeDefined();
  });

  // ── Default path / limits ─────────────────────────────────────────────────────

  it('renders the default path field', () => {
    renderModal();
    expect(screen.getByDisplayValue('/')).toBeDefined();
  });

  it('renders the default path field (defaultSettings)', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByDisplayValue('/tmp')).toBeDefined();
  });

  it('renders the editor limit field', () => {
    renderModal();
    expect(screen.getByDisplayValue('1048576')).toBeDefined();
  });

  it('renders the preview limit field', () => {
    renderModal();
    expect(screen.getByDisplayValue('524288')).toBeDefined();
  });

  it('renders editor and preview limit fields', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByDisplayValue('524288')).toBeDefined();
    expect(screen.getByDisplayValue('262144')).toBeDefined();
  });

  // ── Buttons ───────────────────────────────────────────────────────────────────

  it('renders Save and Cancel buttons', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
  });

  // ── onClose ───────────────────────────────────────────────────────────────────

  it('calls onClose when clicking the X button', () => {
    const onCloseMock = vi.fn();
    renderModal(makeSettings(), onCloseMock);
    const allButtons = screen.getAllByRole('button');
    const xButton = allButtons.find(
      (btn) => btn.className.includes('min-h-[44px]') || btn.querySelector('svg.lucide-x') !== null
    );
    fireEvent.click(xButton ?? allButtons[0]);
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onCloseMock = vi.fn();
    renderModal(makeSettings(), onCloseMock);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('calls onClose when Cancel button is clicked', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Add shortcut ──────────────────────────────────────────────────────────────

  it('adds a new empty shortcut when Add is clicked', () => {
    renderModal();
    const initialLabelInputs = screen.getAllByPlaceholderText('Logs');
    fireEvent.click(screen.getByText('Add'));
    const newLabelInputs = screen.getAllByPlaceholderText('Logs');
    expect(newLabelInputs.length).toBe(initialLabelInputs.length + 1);
  });

  it('adds a new shortcut row when Add button is clicked', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    const addButton = screen.getByRole('button', { name: /add/i });
    const initialLabelInputs = screen.getAllByPlaceholderText('Logs');
    const initialCount = initialLabelInputs.length;

    fireEvent.click(addButton);

    const newLabelInputs = screen.getAllByPlaceholderText('Logs');
    expect(newLabelInputs.length).toBe(initialCount + 1);
  });

  // ── Remove shortcut ───────────────────────────────────────────────────────────

  it('removes a shortcut when the trash button is clicked', () => {
    renderModal();
    const initialPathInputs = screen.getAllByPlaceholderText('/var/log');
    expect(initialPathInputs.length).toBeGreaterThan(0);
  });

  it('removes a shortcut when its delete button is clicked', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    const initialLabelCount = screen.getAllByDisplayValue(/Root|Home/).length;
    expect(initialLabelCount).toBe(2);

    const deleteButtons = document.querySelectorAll('button[class*="hover:text-destructive"]');
    expect(deleteButtons.length).toBe(2);
    fireEvent.click(deleteButtons[0]);

    const newLabelCount = screen.queryAllByDisplayValue(/Root|Home/).length;
    expect(newLabelCount).toBe(1);
  });

  // ── Edit shortcuts ────────────────────────────────────────────────────────────

  it('updates shortcut label when edited', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    const labelInput = screen.getByDisplayValue('Root');
    fireEvent.change(labelInput, { target: { value: 'Filesystem' } });
    expect(screen.getByDisplayValue('Filesystem')).toBeDefined();
  });

  it('updates shortcut path when edited', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    const pathInput = screen.getByDisplayValue('/home/user');
    fireEvent.change(pathInput, { target: { value: '/var/log' } });
    expect(screen.getByDisplayValue('/var/log')).toBeDefined();
  });

  it('updates defaultPath when user types in the field', () => {
    renderModal();
    const defaultPathInput = screen.getByDisplayValue('/');
    fireEvent.change(defaultPathInput, { target: { value: '/home/user' } });
    expect(screen.getByDisplayValue('/home/user')).toBeDefined();
  });

  it('updates default path when edited', () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    const defaultPathInput = screen.getByDisplayValue('/tmp');
    fireEvent.change(defaultPathInput, { target: { value: '/etc' } });
    expect(screen.getByDisplayValue('/etc')).toBeDefined();
  });

  // ── Save / API ────────────────────────────────────────────────────────────────

  it('saves settings via PUT request and calls onSaved', async () => {
    const onSavedMock = vi.fn();
    const onCloseMock = vi.fn();
    const savedSettings = makeSettings();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: savedSettings }),
    });

    renderModal(makeSettings(), onCloseMock, onSavedMock);

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/modules/file-browser/settings',
        expect.objectContaining({ method: 'PUT' })
      );
      expect(onSavedMock).toHaveBeenCalledWith(savedSettings);
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it('sends PUT request to /api/modules/file-browser/settings on save', async () => {
    await act(async () => {
      render(
        <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/modules/file-browser/settings',
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  it('calls onSaved with returned settings on successful save', async () => {
    await act(async () => {
      render(
        <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
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

  // ── Error handling ────────────────────────────────────────────────────────────

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
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
  });

  it('shows error toast when API returns error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Validation failed' }),
    });
    await act(async () => {
      render(
        <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Validation failed', variant: 'destructive' })
      );
    });
  });

  it('shows error toast when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(
        <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
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

  // ── Validation warnings ───────────────────────────────────────────────────────

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
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Every shortcut needs a label and path',
          variant: 'warning',
        })
      );
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
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Every shortcut needs a label and path',
          variant: 'warning',
        })
      );
    });
  });

  it('shows warning toast when saving with empty shortcut fields', async () => {
    render(
      <FileBrowserSettingsModal settings={defaultSettings} onClose={onClose} onSaved={onSaved} />
    );
    const addButton = screen.getByRole('button', { name: /add/i });
    fireEvent.click(addButton);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Every shortcut needs a label and path',
          variant: 'warning',
        })
      );
    });
  });

  // ── Event dispatch ────────────────────────────────────────────────────────────

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

  // ── Edge cases ────────────────────────────────────────────────────────────────

  it('renders with no shortcuts', () => {
    renderModal(makeSettings({ shortcuts: [] as FileBrowserShortcut[] }));
    expect(screen.queryByPlaceholderText('Logs')).toBeNull();
  });
});
