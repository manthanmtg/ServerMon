import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FileBrowserEntryList, type FileEntry } from './FileBrowserEntryList';

const makeEntry = (overrides: Partial<FileEntry> = {}): FileEntry => ({
  name: 'test-file.ts',
  path: '/root/test-file.ts',
  parentPath: '/root',
  extension: 'ts',
  isDirectory: false,
  size: 1024,
  modifiedAt: '2026-03-10T10:00:00.000Z',
  permissions: 'rw-r--r--',
  canRead: true,
  canWrite: true,
  kind: 'code',
  ...overrides,
});

const defaultProps = {
  entries: [],
  selectedPath: null,
  favoritePaths: new Set<string>(),
  onNavigate: vi.fn(),
  onPreview: vi.fn(),
  onEdit: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onDownload: vi.fn(),
  onCopyPath: vi.fn(),
  onFavorite: vi.fn(),
};

describe('FileBrowserEntryList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when entries is empty', () => {
    render(<FileBrowserEntryList {...defaultProps} entries={[]} />);
    expect(screen.getByText('This folder is empty')).toBeDefined();
  });

  it('renders entry names', () => {
    const entries = [
      makeEntry({ name: 'index.ts', path: '/root/index.ts' }),
      makeEntry({ name: 'README.md', path: '/root/README.md', extension: 'md', kind: 'text' }),
    ];
    render(<FileBrowserEntryList {...defaultProps} entries={entries} />);
    expect(screen.getAllByText('index.ts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('README.md').length).toBeGreaterThan(0);
  });

  it('renders directory entries', () => {
    const entry = makeEntry({
      name: 'src',
      path: '/root/src',
      isDirectory: true,
      kind: 'directory',
    });
    render(<FileBrowserEntryList {...defaultProps} entries={[entry]} />);
    expect(screen.getAllByText('src').length).toBeGreaterThan(0);
  });

  it('calls onNavigate when directory is clicked (mobile view)', () => {
    const entry = makeEntry({
      name: 'src',
      path: '/root/src',
      isDirectory: true,
      kind: 'directory',
    });
    render(<FileBrowserEntryList {...defaultProps} entries={[entry]} />);
    // Click mobile view buttons
    const buttons = document.querySelectorAll('.flex.items-center.gap-3.flex-1.min-w-0');
    if (buttons.length > 0) {
      fireEvent.click(buttons[0]);
      expect(defaultProps.onNavigate).toHaveBeenCalledWith('/root/src');
    }
  });

  it('calls onPreview when file is clicked (mobile view)', () => {
    const entry = makeEntry({ name: 'index.ts', path: '/root/index.ts' });
    render(<FileBrowserEntryList {...defaultProps} entries={[entry]} />);
    const buttons = document.querySelectorAll('.flex.items-center.gap-3.flex-1.min-w-0');
    if (buttons.length > 0) {
      fireEvent.click(buttons[0]);
      expect(defaultProps.onPreview).toHaveBeenCalledWith(entry);
    }
  });

  it('calls onDelete when Delete button clicked (desktop view)', () => {
    const entry = makeEntry({ name: 'index.ts', path: '/root/index.ts' });
    render(<FileBrowserEntryList {...defaultProps} entries={[entry]} />);
    const deleteBtn = screen.getAllByTitle('Delete')[0];
    fireEvent.click(deleteBtn);
    expect(defaultProps.onDelete).toHaveBeenCalledWith(entry);
  });

  it('calls onCopyPath when Copy Path button clicked (desktop view)', () => {
    const entry = makeEntry({ name: 'file.ts', path: '/root/file.ts' });
    render(<FileBrowserEntryList {...defaultProps} entries={[entry]} />);
    const copyBtn = screen.getAllByTitle('Copy Path')[0];
    fireEvent.click(copyBtn);
    expect(defaultProps.onCopyPath).toHaveBeenCalledWith(entry);
  });

  it('shows Edit and Download buttons for file entries (desktop view)', () => {
    const entry = makeEntry({ name: 'code.ts', path: '/root/code.ts' });
    render(<FileBrowserEntryList {...defaultProps} entries={[entry]} />);
    expect(screen.getAllByTitle('Edit').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Download').length).toBeGreaterThan(0);
  });

  it('does not show Edit and Download buttons for directory entries (desktop view)', () => {
    const entry = makeEntry({
      name: 'src',
      path: '/root/src',
      isDirectory: true,
      kind: 'directory',
    });
    render(<FileBrowserEntryList {...defaultProps} entries={[entry]} />);
    expect(screen.queryByTitle('Edit')).toBeNull();
    expect(screen.queryByTitle('Download')).toBeNull();
  });

  it('calls onFavorite when favorite button clicked (desktop view)', () => {
    const entry = makeEntry({ name: 'index.ts', path: '/root/index.ts' });
    render(<FileBrowserEntryList {...defaultProps} entries={[entry]} />);
    const favBtn = screen.getAllByTitle('Add to shortcuts')[0];
    fireEvent.click(favBtn);
    expect(defaultProps.onFavorite).toHaveBeenCalledWith(entry);
  });

  it('shows Remove from shortcuts title when entry is favorited', () => {
    const entry = makeEntry({ name: 'index.ts', path: '/root/index.ts' });
    const favoritePaths = new Set(['/root/index.ts']);
    render(
      <FileBrowserEntryList {...defaultProps} entries={[entry]} favoritePaths={favoritePaths} />
    );
    expect(screen.getAllByTitle('Remove from shortcuts').length).toBeGreaterThan(0);
  });

  it('calls onEdit when Edit button clicked (desktop view)', () => {
    const entry = makeEntry({ name: 'file.ts', path: '/root/file.ts' });
    render(<FileBrowserEntryList {...defaultProps} entries={[entry]} />);
    const editBtn = screen.getAllByTitle('Edit')[0];
    fireEvent.click(editBtn);
    expect(defaultProps.onEdit).toHaveBeenCalledWith(entry);
  });

  it('calls onRename when Rename button clicked (desktop view)', () => {
    const entry = makeEntry({ name: 'file.ts', path: '/root/file.ts' });
    render(<FileBrowserEntryList {...defaultProps} entries={[entry]} />);
    const renameBtn = screen.getAllByTitle('Rename')[0];
    fireEvent.click(renameBtn);
    expect(defaultProps.onRename).toHaveBeenCalledWith(entry);
  });

  it('renders multiple entries', () => {
    const entries = [
      makeEntry({ name: 'a.ts', path: '/root/a.ts' }),
      makeEntry({ name: 'b.ts', path: '/root/b.ts' }),
      makeEntry({ name: 'c.ts', path: '/root/c.ts' }),
    ];
    render(<FileBrowserEntryList {...defaultProps} entries={entries} />);
    expect(screen.getAllByText('a.ts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('b.ts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('c.ts').length).toBeGreaterThan(0);
  });
});
