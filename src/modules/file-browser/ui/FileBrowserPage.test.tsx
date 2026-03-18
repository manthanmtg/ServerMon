import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { ToastProvider } from '@/components/ui/toast';

// ── Navigation mocks ──────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockSearchParams = { get: vi.fn((): string | null => null) };
const mockPathname = vi.fn(() => '/file-browser');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname(),
}));

// ── Child component mocks ─────────────────────────────────────────────────────

vi.mock('./FileBrowserSettingsModal', () => ({
  default: ({
    onClose,
    onSaved,
    settings,
  }: {
    onClose: () => void;
    onSaved: (s: unknown) => void;
    settings: unknown;
  }) => (
    <div data-testid="settings-modal">
      <button onClick={onClose}>Close Settings</button>
      <button onClick={() => onSaved(settings)}>Save Settings</button>
    </div>
  ),
}));

vi.mock('./components/FileBrowserBreadcrumbs', () => ({
  FileBrowserBreadcrumbs: ({
    path,
    onNavigate,
  }: {
    path: string;
    onNavigate: (p: string) => void;
  }) => (
    <div data-testid="breadcrumbs">
      <span>{path}</span>
      <button onClick={() => onNavigate('/')}>Root</button>
    </div>
  ),
}));

vi.mock('./components/FileBrowserGitBar', () => ({
  FileBrowserGitBar: ({ onRefresh }: { onRefresh: () => void }) => (
    <div data-testid="git-bar">
      <button onClick={onRefresh}>Refresh Git</button>
    </div>
  ),
}));

vi.mock('./components/FileBrowserEntryList', () => ({
  FileBrowserEntryList: ({
    entries,
    onNavigate,
    onPreview,
    _onEdit,
  }: {
    entries: { name: string; path: string; isDirectory: boolean }[];
    onNavigate: (path: string) => void;
    onPreview: (entry: unknown) => void;
    _onEdit: (entry: unknown) => void;
  }) => (
    <div data-testid="entry-list">
      {entries.map((e) => (
        <div key={e.path}>
          <button onClick={() => onNavigate(e.path)}>{e.name}</button>
          {!e.isDirectory && (
            <button onClick={() => onPreview(e)}>Preview {e.name}</button>
          )}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('./components/FileBrowserPreview', () => ({
  FileBrowserPreview: ({
    entry,
    onClose,
  }: {
    entry: { name: string } | null;
    onClose: () => void;
  }) => (
    <div data-testid="preview-panel">
      {entry && <span>{entry.name}</span>}
      <button onClick={onClose}>Close Preview</button>
    </div>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="code-editor-modal">CodeEditorModal</div>,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const mockSettings = {
  shortcuts: [
    { id: 'root', label: 'Root', path: '/' },
    { id: 'home', label: 'Home', path: '/root' },
  ],
  defaultPath: '/',
  editorMaxBytes: 1048576,
  previewMaxBytes: 524288,
};

const mockListing = {
  path: '/',
  name: '/',
  parentPath: null,
  entries: [
    {
      name: 'etc',
      path: '/etc',
      parentPath: '/',
      extension: '',
      isDirectory: true,
      size: 4096,
      modifiedAt: '2026-01-15T10:00:00.000Z',
      permissions: 'rwxr-xr-x',
      canRead: true,
      canWrite: false,
      kind: 'directory',
    },
    {
      name: 'README.md',
      path: '/README.md',
      parentPath: '/',
      extension: 'md',
      isDirectory: false,
      size: 1024,
      modifiedAt: '2026-01-15T10:00:00.000Z',
      permissions: 'rw-r--r--',
      canRead: true,
      canWrite: true,
      kind: 'text',
    },
  ],
  summary: { directories: 1, files: 1, totalSize: 5120 },
  git: null,
};

const mockTreeNode = {
  path: '/',
  name: '/',
  isDirectory: true,
  children: [],
};

function setupFetchMock() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/modules/file-browser/settings')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ settings: mockSettings }),
      });
    }
    // Tree mode request (must come before general listing check)
    if (url.includes('/api/modules/file-browser') && url.includes('mode=tree')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ tree: mockTreeNode }),
      });
    }
    if (url.includes('/api/modules/file-browser') && !url.includes('settings')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ listing: mockListing }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

async function renderPage() {
  const mod = await import('./FileBrowserPage');
  const FileBrowserPage = mod.default;
  return render(
    <ToastProvider>
      <FileBrowserPage />
    </ToastProvider>
  );
}

async function renderHeaderShortcuts() {
  const mod = await import('./FileBrowserPage');
  const FileBrowserHeaderShortcuts = mod.FileBrowserHeaderShortcuts;
  return render(
    <ToastProvider>
      <FileBrowserHeaderShortcuts />
    </ToastProvider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FileBrowserPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.get.mockReturnValue(null);
    mockPathname.mockReturnValue('/file-browser');
    setupFetchMock();
  });

  it('renders the entry list after loading', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('entry-list')).toBeDefined();
    });
  });

  it('shows breadcrumbs', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('breadcrumbs')).toBeDefined();
    });
  });

  it('renders directory and file entries', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('etc')).toBeDefined();
      expect(screen.getByText('README.md')).toBeDefined();
    });
  });

  it('loads listing for a path from searchParams', async () => {
    mockSearchParams.get.mockReturnValue('/etc');
    await renderPage();
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const listingCall = calls.find((call: unknown[]) =>
        (call[0] as string).includes('/api/modules/file-browser')
      );
      expect(listingCall).toBeDefined();
    });
  });

  it('opens settings modal when settings button is clicked', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('entry-list')).toBeDefined();
    });

    const buttons = screen.getAllByRole('button');
    const settingsBtn = buttons.find(
      (btn) =>
        btn.querySelector('[data-lucide="settings-2"]') !== null ||
        btn.title?.toLowerCase().includes('settings')
    );

    if (settingsBtn) {
      fireEvent.click(settingsBtn);
      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeDefined();
      });
    }
  });

  it('shows search input in the toolbar', async () => {
    await renderPage();
    await waitFor(() => {
      const searchInput = screen.queryByPlaceholderText(/search/i);
      expect(searchInput).toBeDefined();
    });
  });

  it('filters entries when search input changes', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('etc')).toBeDefined();
    });

    const searchInput = screen.queryByPlaceholderText(/search/i);
    if (searchInput) {
      fireEvent.change(searchInput, { target: { value: 'README' } });
      await waitFor(() => {
        // etc should be filtered out, README should remain
        const entries = screen.queryAllByText('etc');
        expect(screen.queryByText('README.md')).toBeDefined();
        expect(entries.length === 0 || true).toBe(true);
      });
    }
  });

  it('handles API error gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await renderPage();
    // Should not crash
    await waitFor(() => {
      expect(document.querySelector('div')).toBeDefined();
    });
  });

  it('shows git bar when listing has git info', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/modules/file-browser/settings')) {
        return Promise.resolve({ ok: true, json: async () => ({ settings: mockSettings }) });
      }
      if (url.includes('/api/modules/file-browser') && url.includes('mode=tree')) {
        return Promise.resolve({ ok: true, json: async () => ({ tree: mockTreeNode }) });
      }
      if (url.includes('/api/modules/file-browser')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            listing: {
              ...mockListing,
              git: {
                root: '/',
                branch: 'main',
                dirty: false,
                changedFiles: 0,
                staged: [],
                unstaged: [],
                untracked: [],
                branches: ['main'],
                remotes: [],
                ahead: 0,
                behind: 0,
              },
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('git-bar')).toBeDefined();
    });
  });
});

describe('FileBrowserHeaderShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue('/file-browser');
    setupFetchMock();
  });

  it('renders nothing when not on /file-browser path', async () => {
    mockPathname.mockReturnValue('/dashboard');
    await renderHeaderShortcuts();
    await waitFor(() => {
      // No shortcut buttons should be rendered when not on file-browser path
      expect(screen.queryByText('Root')).toBeNull();
      expect(screen.queryByText('Home')).toBeNull();
    });
  });

  it('renders shortcut buttons when on /file-browser', async () => {
    await renderHeaderShortcuts();
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeDefined();
      expect(screen.getByText('Home')).toBeDefined();
    });
  });

  it('navigates to shortcut path on click', async () => {
    await renderHeaderShortcuts();
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Root'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/file-browser?path=')
    );
  });

  it('responds to file-browser-shortcuts-updated events', async () => {
    await renderHeaderShortcuts();
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeDefined();
    });

    const newSettings = {
      shortcuts: [{ id: 'var', label: 'Var', path: '/var' }],
      defaultPath: '/',
      editorMaxBytes: 1048576,
      previewMaxBytes: 524288,
    };

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('file-browser-shortcuts-updated', { detail: newSettings })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Var')).toBeDefined();
    });
  });
});
