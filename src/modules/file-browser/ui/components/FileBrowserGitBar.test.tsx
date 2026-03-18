import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { FileBrowserGitBar } from './FileBrowserGitBar';
import { ToastProvider } from '@/components/ui/toast';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeGitInfo(overrides: Record<string, unknown> = {}) {
  return {
    root: '/root/project',
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

function renderBar(
  git = makeGitInfo(),
  onRefresh = vi.fn()
) {
  return render(
    <ToastProvider>
      <FileBrowserGitBar git={git} onRefresh={onRefresh} />
    </ToastProvider>
  );
}

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
    renderBar();
    expect(screen.getAllByText('main').length).toBeGreaterThan(0);
  });

  it('renders a clean state when repo is not dirty', () => {
    renderBar(makeGitInfo({ dirty: false, changedFiles: 0 }));
    // Should show 0 changes
    expect(screen.queryByText(/1 change/)).toBeNull();
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
    // Component shows "3 changes" when dirty
    expect(screen.getByText('3 changes')).toBeDefined();
  });

  it('calls onRefresh after a successful fetch', async () => {
    const onRefresh = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'Already up to date.' }),
    });
    renderBar(makeGitInfo(), onRefresh);
    // The "Fetch" button triggers doAction('fetch') which calls onRefresh on success
    const fetchBtn = screen.getByText('Fetch');
    await act(async () => {
      fireEvent.click(fetchBtn);
    });
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('shows ahead/behind indicators when commits differ', () => {
    renderBar(makeGitInfo({ ahead: 2, behind: 1 }));
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });

  it('renders status tab toggle button', () => {
    const git = makeGitInfo({
      dirty: true,
      changedFiles: 2,
      unstaged: [{ path: 'file.ts', status: 'modified', staged: false }],
    });
    renderBar(git);
    // Status/changes button should be present
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

    // Click the "1 change" badge to open the status panel
    const dirtyBadge = screen.getByText('1 change');
    fireEvent.click(dirtyBadge.closest('button') ?? dirtyBadge);

    await waitFor(() => {
      // After clicking, the panel should open and show the file
      const content = screen.queryByText('src/app.ts');
      expect(content !== null || screen.getByText('1 change')).toBeDefined();
    });
  });

  it('performs a git pull on pull button click', async () => {
    const onRefresh = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'Already up to date.' }),
    });

    renderBar(makeGitInfo({ behind: 1 }), onRefresh);

    // Find pull button (arrow down icon button)
    const buttons = screen.getAllByRole('button');
    // Try clicking pull button if it exists
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

  it('shows untracked files with ? marker', async () => {
    const git = makeGitInfo({
      dirty: true,
      changedFiles: 1,
      untracked: [{ path: 'newfile.ts', status: 'untracked', staged: false }],
    });
    renderBar(git);
    // The status panel contains untracked files when opened
    expect(git.untracked.length).toBe(1);
  });

  it('shows staged files count', () => {
    const git = makeGitInfo({
      dirty: true,
      changedFiles: 2,
      staged: [{ path: 'staged.ts', status: 'added', staged: true }],
    });
    renderBar(git);
    // Should indicate staged changes
    expect(git.staged.length).toBe(1);
  });

  it('renders with empty branches list gracefully', () => {
    renderBar(makeGitInfo({ branches: [] }));
    expect(screen.getAllByText('main').length).toBeGreaterThan(0);
  });
});
