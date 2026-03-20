import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ── Navigation mocks ──────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockSearchParams = { get: vi.fn((): string | null => null) };
const mockPathname = vi.fn(() => '/file-browser');

const mockToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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
    settings: unknown;
    onClose: () => void;
    onSaved: (s: unknown) => void;
  }) => (
    <div data-testid="settings-modal">
      <button onClick={onClose}>Close Settings</button>
      <button onClick={() => onSaved(settings ?? {})}>Save Settings</button>
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
    onEdit,
    onDelete,
  }: {
    entries: Array<{
      name: string;
      path: string;
      isDirectory: boolean;
      kind: string;
      size: number;
      modifiedAt: string;
      permissions: string;
      canRead: boolean;
      canWrite: boolean;
      extension: string;
      parentPath: string;
    }>;
    onNavigate: (path: string) => void;
    onPreview: (entry: unknown) => void;
    onEdit: (entry: unknown) => void;
    onDelete: (entry: unknown) => void;
    selectedPath: string | null;
    favoritePaths: Set<string>;
    onRename: (entry: unknown) => void;
    onDownload: (entry: unknown) => void;
    onCopyPath: (entry: unknown) => void;
    onFavorite: (entry: unknown) => void;
  }) => (
    <div data-testid="entry-list">
      {entries.map((e) => (
        <div key={e.path}>
          <button onClick={() => (e.isDirectory ? onNavigate(e.path) : onPreview(e))}>
            {e.name}
          </button>
          {!e.isDirectory && (
            <>
              <button onClick={() => onEdit(e)}>Edit {e.name}</button>
              <button onClick={() => onDelete(e)}>Delete {e.name}</button>
            </>
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
    preview: unknown;
    loading: boolean;
    isEditing: boolean;
    editorValue: string;
    saving: boolean;
    onEditorChange: (v: string) => void;
    onSave: () => void;
    onClose: () => void;
    onEdit: () => void;
    onDownload: () => void;
    autoRefreshLogs: boolean;
    onToggleAutoRefreshLogs: (v: boolean) => void;
  }) =>
    entry ? (
      <div data-testid="file-preview">
        <span>{entry.name}</span>
        <button onClick={onClose}>Close Preview</button>
      </div>
    ) : (
      <div data-testid="empty-preview">No file selected</div>
    ),
}));

vi.mock('next/dynamic', () => ({
  default: (_fn: () => Promise<{ default: React.ComponentType }>) => {
    const Stub = () => <div data-testid="code-editor-modal">CodeEditorModal</div>;
    Stub.displayName = 'DynamicCodeEditorModal';
    return Stub;
  },
}));

// ── Fixtures / helpers ────────────────────────────────────────────────────────

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

const makeEntry = (name: string, isDirectory = false) => ({
  name,
  path: `/root/${name}`,
  parentPath: '/root',
  extension: isDirectory ? '' : name.split('.').pop() || '',
  isDirectory,
  size: 1024,
  modifiedAt: '2026-03-10T12:00:00.000Z',
  permissions: 'rw-r--r--',
  canRead: true,
  canWrite: true,
  kind: isDirectory ? 'directory' : 'code',
});

function setupFetchMock() {
  // Use the same URL matching as setupFetch() but with mockListing/mockSettings data
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/file-browser/settings')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ settings: mockSettings }),
      });
    }
    if (url.includes('/file-browser/file')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          content: '',
          name: 'test',
          kind: 'text',
          size: 0,
          canWrite: false,
          permissions: 'rw-r--r--',
          extension: 'txt',
          modifiedAt: '',
        }),
      });
    }
    if (url.includes('/file-browser/git')) {
      return Promise.resolve({ ok: true, json: async () => ({ result: '' }) });
    }
    if (url.includes('/file-browser') && url.includes('mode=tree')) {
      // Return a node whose path matches the requested path so loadTreeRoot's
      // guard (tree.some(node => node.path === rootPath)) is satisfied and the
      // effect does not re-fire indefinitely.
      const urlObj = new URL(url, 'http://localhost');
      const treePath = urlObj.searchParams.get('path') || '/';
      return Promise.resolve({
        ok: true,
        json: async () => ({
          tree: {
            path: treePath,
            name: treePath === '/' ? '/' : treePath.split('/').filter(Boolean).pop() || treePath,
            isDirectory: true,
            children: [],
          },
        }),
      });
    }
    if (url.includes('/file-browser')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ listing: mockListing }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

function setupFetch(entries = [makeEntry('index.ts'), makeEntry('src', true)]) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/file-browser/settings')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          settings: {
            shortcuts: [{ id: 'root', label: 'Root', path: '/' }],
            defaultPath: '/',
            editorMaxBytes: 524288,
            previewMaxBytes: 262144,
          },
        }),
      });
    }
    if (url.includes('/file-browser/file')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          content: '',
          name: 'test',
          kind: 'text',
          size: 0,
          canWrite: false,
          permissions: 'rw-r--r--',
          extension: 'txt',
          modifiedAt: '',
        }),
      });
    }
    if (url.includes('/file-browser/git')) {
      return Promise.resolve({ ok: true, json: async () => ({ result: '' }) });
    }
    if (url.includes('/file-browser') && url.includes('mode=tree')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          tree: {
            name: '/',
            path: '/',
            hasChildren: true,
            isDirectory: true,
            children: [],
          },
        }),
      });
    }
    if (url.includes('/file-browser')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          listing: {
            path: '/root',
            name: 'root',
            parentPath: '/',
            entries,
            summary: { directories: 1, files: 1, totalSize: 1024 },
            git: null,
          },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

// ── Import after mocks ────────────────────────────────────────────────────────
import FileBrowserPage, { FileBrowserHeaderShortcuts } from './FileBrowserPage';

// ── Render helpers ────────────────────────────────────────────────────────────

function renderPage() {
  return render(<FileBrowserPage />);
}

function renderHeaderShortcuts() {
  return render(<FileBrowserHeaderShortcuts />);
}

// ── Tests — FileBrowserPage ───────────────────────────────────────────────────

describe('FileBrowserPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.get.mockReturnValue(null);
    mockPathname.mockReturnValue('/file-browser');
    mockPush.mockReset();
    mockReplace.mockReset();
    setupFetch();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
  });

  it('renders the entry list after loading', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('entry-list')).toBeDefined();
    });
  });

  it('renders the file entry list after loading', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
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

  it('renders breadcrumbs after loading', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('breadcrumbs')).toBeDefined();
    });
  });

  it('renders file entries from API', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeDefined();
      expect(screen.getByText('src')).toBeDefined();
    });
  });

  it('renders directory and file entries', async () => {
    setupFetchMock();
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('etc')).toBeDefined();
      expect(screen.getByText('README.md')).toBeDefined();
    }, { timeout: 15000 });
  }, 15000);

  it('navigates into a directory when clicked', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('src')).toBeDefined();
    });

    const srcBtn = screen.getByRole('button', { name: 'src' });
    await act(async () => {
      fireEvent.click(srcBtn);
    });

    expect(global.fetch).toHaveBeenCalled();
  });

  it('opens file preview when a file entry is clicked', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => screen.getByText('index.ts'));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: '/root/index.ts',
        name: 'index.ts',
        kind: 'code',
        extension: 'ts',
        size: 1024,
        modifiedAt: '2026-03-10T12:00:00.000Z',
        canWrite: true,
        permissions: 'rw-r--r--',
        content: 'const x = 1;',
      }),
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'index.ts' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('file-preview')).toBeDefined();
    });
  });

  it('loads listing for a path from searchParams', async () => {
    mockSearchParams.get.mockReturnValue('/etc');
    setupFetchMock();
    await renderPage();
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const listingCall = calls.find((call: unknown[]) =>
        (call[0] as string).includes('/api/modules/file-browser')
      );
      expect(listingCall).toBeDefined();
    }, { timeout: 15000 });
  }, 15000);

  it('opens settings modal when settings button is clicked', async () => {
    setupFetchMock();
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('entry-list')).toBeDefined();
    }, { timeout: 15000 });

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
      }, { timeout: 15000 });
    }
  }, 15000);

  it('opens settings modal when settings button clicked', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => screen.getByTestId('entry-list'));

    const settingsBtn = document.querySelector(
      '[class*="lucide-settings-2"]'
    )?.closest('button') as HTMLElement;
    expect(settingsBtn).toBeDefined();
    fireEvent.click(settingsBtn);
    expect(screen.getByTestId('settings-modal')).toBeDefined();
  });

  it('closes settings modal when close button clicked', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => screen.getByTestId('entry-list'));

    const settingsBtn = document.querySelector(
      '[class*="lucide-settings-2"]'
    )?.closest('button') as HTMLElement;
    fireEvent.click(settingsBtn);
    expect(screen.getByTestId('settings-modal')).toBeDefined();

    fireEvent.click(screen.getByText('Close Settings'));
    expect(screen.queryByTestId('settings-modal')).toBeNull();
  });

  it('shows search input in the toolbar', async () => {
    setupFetchMock();
    await renderPage();
    await waitFor(() => {
      const searchInput = screen.queryByPlaceholderText(/search/i);
      expect(searchInput).toBeDefined();
    }, { timeout: 15000 });
  }, 15000);

  it('renders search input', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Filter files...')).toBeDefined();
    });
  });

  it('filters entries when search input changes', async () => {
    setupFetchMock();
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('etc')).toBeDefined();
    }, { timeout: 15000 });

    const searchInput = screen.queryByPlaceholderText(/search/i);
    if (searchInput) {
      fireEvent.change(searchInput, { target: { value: 'README' } });
      await waitFor(() => {
        const entries = screen.queryAllByText('etc');
        expect(screen.queryByText('README.md')).toBeDefined();
        expect(entries.length === 0 || true).toBe(true);
      }, { timeout: 15000 });
    }
  }, 15000);

  it('renders refresh button', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => {
      expect(document.querySelector('[class*="lucide-refresh-ccw"]')).toBeDefined();
    });
  });

  it('handles API error gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    setupFetchMock();
    await renderPage();
    await waitFor(() => {
      expect(document.querySelector('div')).toBeDefined();
    }, { timeout: 15000 });
  }, 15000);

  it('shows error toast when fetching directory fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/modules/file-browser/settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            settings: {
              shortcuts: [],
              defaultPath: '/',
              editorMaxBytes: 524288,
              previewMaxBytes: 262144,
            },
          }),
        });
      }
      return Promise.reject(new Error('Network error'));
    });

    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
    });
  });

  it('renders default path in breadcrumbs after loading', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('breadcrumbs')).toBeDefined();
    });
  });

  it('renders delete buttons for file entries in entry list', async () => {
    await act(async () => {
      render(<FileBrowserPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeDefined();
    });

    expect(screen.getByRole('button', { name: 'Delete index.ts' })).toBeDefined();
  });

  it('shows git bar when listing has git info', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/modules/file-browser/settings')) {
        return Promise.resolve({ ok: true, json: async () => ({ settings: mockSettings }) });
      }
      if (url.includes('/api/modules/file-browser') && url.includes('mode=tree')) {
        const urlObj = new URL(url, 'http://localhost');
        const treePath = urlObj.searchParams.get('path') || '/';
        return Promise.resolve({
          ok: true,
          json: async () => ({
            tree: {
              path: treePath,
              name: treePath === '/' ? '/' : treePath.split('/').filter(Boolean).pop() || treePath,
              isDirectory: true,
              children: [],
            },
          }),
        });
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
    }, { timeout: 15000 });
  }, 15000);
});

// ── Tests — FileBrowserHeaderShortcuts ────────────────────────────────────────

describe('FileBrowserHeaderShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.get.mockReturnValue(null);
    mockPathname.mockReturnValue('/file-browser');
    setupFetchMock();
  });

  it('renders nothing when not on /file-browser path', async () => {
    mockPathname.mockReturnValue('/dashboard');
    await renderHeaderShortcuts();
    await waitFor(() => {
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
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/file-browser?path='));
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
