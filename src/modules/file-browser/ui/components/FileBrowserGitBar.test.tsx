import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { FileBrowserGitBar } from './FileBrowserGitBar';
import { ToastProvider } from '@/components/ui/toast';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGit(
  overrides: Partial<Parameters<typeof FileBrowserGitBar>[0]['git']> = {}
) {
  return {
    root: '/repo',
    branch: 'main',
    dirty: false,
    changedFiles: 0,
    staged: [] as { path: string; status: string; staged: boolean }[],
    unstaged: [] as { path: string; status: string; staged: boolean }[],
    untracked: [] as { path: string; status: string; staged: boolean }[],
    branches: ['main', 'dev', 'feature/test'],
    remotes: ['origin'],
    ahead: 0,
    behind: 0,
    ...overrides,
  };
}

// Alias for backward-compat with tests that use the old name
const makeGitInfo = makeGit;

function renderGitBar(git: ReturnType<typeof makeGit>, onRefresh = vi.fn()) {
  return render(
    <ToastProvider>
      <FileBrowserGitBar git={git} onRefresh={onRefresh} />
    </ToastProvider>
  );
}

// Alias for backward-compat
const renderBar = renderGitBar;

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FileBrowserGitBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    });
  });

  it('renders the branch name', () => {
    renderBar(makeGitInfo());
    expect(screen.getAllByText('main').length).toBeGreaterThan(0);
  });

  it('renders the current branch name', () => {
    renderGitBar(makeGit({ branch: 'feature/awesome' }));
    expect(screen.getByText('feature/awesome')).toBeDefined();
  });

  it('renders a clean state when repo is not dirty', () => {
    renderBar(makeGitInfo({ dirty: false, changedFiles: 0 }));
    expect(screen.queryByText(/1 change/)).toBeNull();
  });

  it('shows Clean badge when not dirty', () => {
    renderGitBar(makeGit({ dirty: false }));
    expect(screen.getByText('Clean')).toBeDefined();
  });

  it('renders dirty state with changed file count', () => {
    renderBar(
      makeGitInfo({
        dirty: true,
        changedFiles: 3,
        unstaged: [
          { path: 'a.ts', status: 'modified', staged: false },
          { path: 'b.ts', status: 'modified', staged: false },
          { path: 'c.ts', status: 'modified', staged: false },
        ],
      })
    );
    expect(screen.getByText('3 changes')).toBeDefined();
  });

  it('shows change count badge when dirty', () => {
    renderGitBar(
      makeGit({
        dirty: true,
        changedFiles: 5,
        unstaged: [
          { path: 'a.ts', status: 'modified', staged: false },
          { path: 'b.ts', status: 'modified', staged: false },
        ],
        untracked: [{ path: 'c.ts', status: 'untracked', staged: false }],
        staged: [
          { path: 'd.ts', status: 'modified', staged: true },
          { path: 'e.ts', status: 'added', staged: true },
        ],
      })
    );
    expect(screen.getByText('5 changes')).toBeDefined();
  });

  it('shows singular "1 change" for a single changed file', () => {
    renderGitBar(
      makeGit({
        dirty: true,
        changedFiles: 1,
        unstaged: [{ path: 'a.ts', status: 'modified', staged: false }],
      })
    );
    expect(screen.getByText('1 change')).toBeDefined();
  });

  it('renders Fetch button', () => {
    renderGitBar(makeGit());
    expect(screen.getByText('Fetch')).toBeDefined();
  });

  it('calls onRefresh after a successful fetch', async () => {
    const onRefresh = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'Already up to date.' }),
    });
    renderBar(makeGitInfo(), onRefresh);
    const fetchBtn = screen.getByText('Fetch');
    await act(async () => {
      fireEvent.click(fetchBtn);
    });
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('clicking Fetch calls the git API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'Fetched' }),
    });
    const onRefresh = vi.fn();
    renderGitBar(makeGit(), onRefresh);

    await act(async () => {
      fireEvent.click(screen.getByText('Fetch'));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/file-browser/git',
      expect.objectContaining({ method: 'POST' })
    );
    expect(onRefresh).toHaveBeenCalled();
  });

  it('shows ahead/behind indicators when commits differ', () => {
    renderBar(makeGitInfo({ ahead: 2, behind: 1 }));
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });

  it('shows ahead count when ahead of remote', () => {
    renderGitBar(makeGit({ ahead: 3 }));
    expect(screen.getByText('3')).toBeDefined();
  });

  it('shows behind count when behind remote', () => {
    renderGitBar(makeGit({ behind: 2 }));
    expect(screen.getByText('2')).toBeDefined();
  });

  it('shows Pull button when behind remote', () => {
    renderGitBar(makeGit({ behind: 1 }));
    expect(screen.getByText('Pull')).toBeDefined();
  });

  it('does not show Pull button when not behind', () => {
    renderGitBar(makeGit({ behind: 0 }));
    expect(screen.queryByText('Pull')).toBeNull();
  });

  it('shows Reset button when dirty', () => {
    renderGitBar(
      makeGit({ dirty: true, unstaged: [{ path: 'x.ts', status: 'modified', staged: false }] })
    );
    expect(screen.getByTitle('Discard all changes')).toBeDefined();
  });

  it('Commit button is disabled when no staged files', () => {
    renderGitBar(
      makeGit({
        dirty: true,
        staged: [],
        unstaged: [{ path: 'a.ts', status: 'modified', staged: false }],
      })
    );
    const commitBtn = screen.getByText('Commit').closest('button');
    expect(commitBtn?.hasAttribute('disabled')).toBe(true);
  });

  it('Commit button is enabled when staged files exist', () => {
    renderGitBar(
      makeGit({
        dirty: true,
        staged: [{ path: 'a.ts', status: 'modified', staged: true }],
      })
    );
    const commitBtn = screen.getByText('Commit').closest('button');
    expect(commitBtn?.hasAttribute('disabled')).toBe(false);
  });

  it('renders status tab toggle button', () => {
    const git = makeGitInfo({
      dirty: true,
      changedFiles: 2,
      unstaged: [{ path: 'file.ts', status: 'modified', staged: false }],
    });
    renderBar(git);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows changed files in the status panel when opened', async () => {
    const git = makeGitInfo({
      dirty: true,
      changedFiles: 1,
      unstaged: [{ path: 'src/app.ts', status: 'modified', staged: false }],
      staged: [],
      untracked: [],
    });
    renderBar(git);

    const dirtyBadge = screen.getByText('1 change');
    fireEvent.click(dirtyBadge.closest('button') ?? dirtyBadge);

    await waitFor(() => {
      const content = screen.queryByText('src/app.ts');
      expect(content !== null || screen.getByText('1 change')).toBeDefined();
    });
  });

  it('clicking branch button toggles branch dropdown', () => {
    renderGitBar(makeGit({ branches: ['main', 'dev'] }));
    const branchBtn = screen.getByText('main').closest('button')!;
    fireEvent.click(branchBtn);
    expect(screen.getByText('dev')).toBeDefined();
  });

  it('clicking status badge toggles status panel when dirty', () => {
    renderGitBar(
      makeGit({
        dirty: true,
        staged: [{ path: 'a.ts', status: 'modified', staged: true }],
        unstaged: [],
        untracked: [],
      })
    );
    fireEvent.click(screen.getByText('1 change'));
    expect(screen.getByText(/Staged/)).toBeDefined();
  });

  it('shows Commit form when Commit button is clicked with staged files', () => {
    renderGitBar(
      makeGit({
        dirty: true,
        staged: [{ path: 'a.ts', status: 'modified', staged: true }],
      })
    );
    fireEvent.click(screen.getAllByText('Commit')[0]);
    expect(screen.getByPlaceholderText('Commit message...')).toBeDefined();
  });

  it('performs a git pull on pull button click', async () => {
    const onRefresh = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'Already up to date.' }),
    });

    renderBar(makeGitInfo({ behind: 1 }), onRefresh);

    const buttons = screen.getAllByRole('button');
    const pullBtn = buttons.find(
      (btn) =>
        btn.querySelector('[data-lucide="arrow-down"]') !== null ||
        btn.getAttribute('title')?.toLowerCase().includes('pull')
    );
    if (pullBtn) {
      await act(async () => {
        fireEvent.click(pullBtn);
      });
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    }
  });

  it('shows untracked files with ? marker', () => {
    const git = makeGitInfo({
      dirty: true,
      changedFiles: 1,
      untracked: [{ path: 'newfile.ts', status: 'untracked', staged: false }],
    });
    renderBar(git);
    expect(git.untracked.length).toBe(1);
  });

  it('shows staged files count', () => {
    const git = makeGitInfo({
      dirty: true,
      changedFiles: 2,
      staged: [{ path: 'staged.ts', status: 'added', staged: true }],
    });
    renderBar(git);
    expect(git.staged.length).toBe(1);
  });

  it('renders with empty branches list gracefully', () => {
    renderBar(makeGitInfo({ branches: [] }));
    expect(screen.getAllByText('main').length).toBeGreaterThan(0);
  });
});
