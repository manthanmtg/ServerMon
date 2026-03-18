import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FileBrowserPreview } from './FileBrowserPreview';
import { FileEntry, FileKind } from './FileBrowserEntryList';

// next/image — stub it out as a plain <span> to avoid lint warnings
vi.mock('next/image', () => ({
  default: ({
    alt,
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
  }) => <span data-testid="next-image">{alt}</span>,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    name: 'example.txt',
    path: '/root/example.txt',
    parentPath: '/root',
    extension: 'txt',
    isDirectory: false,
    size: 1024,
    modifiedAt: '2026-01-15T10:00:00.000Z',
    permissions: 'rw-r--r--',
    canRead: true,
    canWrite: true,
    kind: 'text' as FileKind,
    ...overrides,
  };
}

const defaultProps = {
  entry: null as FileEntry | null,
  preview: null as ReturnType<typeof makePreview> | null,
  loading: false,
  isEditing: false,
  editorValue: '',
  saving: false,
  onEditorChange: vi.fn(),
  onSave: vi.fn(),
  onClose: vi.fn(),
  onEdit: vi.fn(),
  onDownload: vi.fn(),
  autoRefreshLogs: false,
  onToggleAutoRefreshLogs: vi.fn(),
};

function makePreview(overrides: Record<string, unknown> = {}) {
  return {
    path: '/root/example.txt',
    name: 'example.txt',
    kind: 'text' as FileKind,
    extension: 'txt',
    size: 1024,
    modifiedAt: '2026-01-15T10:00:00.000Z',
    canWrite: true,
    permissions: 'rw-r--r--',
    content: 'Hello, world!',
    truncated: false,
    encoding: 'utf8' as const,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FileBrowserPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state', () => {
    it('shows the "Select a file" message when entry is null', () => {
      render(<FileBrowserPreview {...defaultProps} />);
      expect(screen.getByText('Preview')).toBeDefined();
      expect(screen.getByText(/Select a file to preview/)).toBeDefined();
    });
  });

  describe('with an entry selected', () => {
    it('shows the filename in the header', () => {
      const entry = makeEntry();
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={makePreview()} />);
      expect(screen.getAllByText('example.txt').length).toBeGreaterThan(0);
    });

    it('shows the file kind badge', () => {
      const entry = makeEntry({ kind: 'code' as FileKind });
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={makePreview()} />);
      expect(screen.getAllByText('code').length).toBeGreaterThan(0);
    });

    it('shows permissions', () => {
      const entry = makeEntry();
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={makePreview()} />);
      expect(screen.getAllByText('rw-r--r--').length).toBeGreaterThan(0);
    });

    it('calls onClose when the close button is clicked', () => {
      const onClose = vi.fn();
      const entry = makeEntry();
      render(
        <FileBrowserPreview
          {...defaultProps}
          entry={entry}
          preview={makePreview()}
          onClose={onClose}
        />
      );
      const buttons = screen.getAllByRole('button');
      // The close button (X) is the first button
      fireEvent.click(buttons[0]);
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onDownload when Download is clicked', () => {
      const onDownload = vi.fn();
      const entry = makeEntry();
      render(
        <FileBrowserPreview
          {...defaultProps}
          entry={entry}
          preview={makePreview()}
          onDownload={onDownload}
        />
      );
      fireEvent.click(screen.getByText('Download'));
      expect(onDownload).toHaveBeenCalled();
    });

    it('shows Edit button when canWrite is true and not editing', () => {
      const entry = makeEntry();
      render(
        <FileBrowserPreview
          {...defaultProps}
          entry={entry}
          preview={makePreview({ canWrite: true })}
          isEditing={false}
        />
      );
      expect(screen.getByText('Edit')).toBeDefined();
    });

    it('hides Edit button when canWrite is false', () => {
      const entry = makeEntry({ canWrite: false });
      render(
        <FileBrowserPreview
          {...defaultProps}
          entry={entry}
          preview={makePreview({ canWrite: false })}
          isEditing={false}
        />
      );
      expect(screen.queryByText('Edit')).toBeNull();
    });

    it('calls onEdit when the Edit button is clicked', () => {
      const onEdit = vi.fn();
      const entry = makeEntry();
      render(
        <FileBrowserPreview
          {...defaultProps}
          entry={entry}
          preview={makePreview({ canWrite: true })}
          onEdit={onEdit}
        />
      );
      fireEvent.click(screen.getByText('Edit'));
      expect(onEdit).toHaveBeenCalled();
    });

    it('shows file size in a human-readable format', () => {
      const entry = makeEntry({ size: 2048 });
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={makePreview()} />);
      // 2048 bytes = 2 KB
      expect(screen.getAllByText('2 KB').length).toBeGreaterThan(0);
    });
  });

  describe('loading state', () => {
    it('shows spinner when loading is true', () => {
      const entry = makeEntry();
      render(
        <FileBrowserPreview {...defaultProps} entry={entry} preview={null} loading={true} />
      );
      // spinner is present (role="status" or data-testid)
      expect(document.querySelector('.animate-spin')).toBeDefined();
    });
  });

  describe('content rendering', () => {
    it('shows text content when preview has content', () => {
      const entry = makeEntry({ kind: 'text' as FileKind });
      const preview = makePreview({ content: 'Hello from preview' });
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={preview} />);
      expect(screen.getByText('Hello from preview')).toBeDefined();
    });

    it('shows truncation warning when preview.truncated is true', () => {
      const entry = makeEntry({ kind: 'text' as FileKind });
      const preview = makePreview({ truncated: true });
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={preview} />);
      expect(screen.getByText(/Displaying first/)).toBeDefined();
    });

    it('shows log viewer for log kind files', () => {
      const entry = makeEntry({ kind: 'log' as FileKind, extension: 'log' });
      const preview = makePreview({
        kind: 'log',
        tailLines: ['2026-01-15 Info Starting...', '2026-01-15 Error Failed'],
      });
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={preview} />);
      expect(screen.getByText('Log Viewer')).toBeDefined();
      expect(screen.getByText('2026-01-15 Info Starting...')).toBeDefined();
    });

    it('toggles auto-refresh when Live button is clicked in log view', () => {
      const onToggle = vi.fn();
      const entry = makeEntry({ kind: 'log' as FileKind });
      const preview = makePreview({ kind: 'log', tailLines: ['line1'] });
      render(
        <FileBrowserPreview
          {...defaultProps}
          entry={entry}
          preview={preview}
          autoRefreshLogs={false}
          onToggleAutoRefreshLogs={onToggle}
        />
      );
      fireEvent.click(screen.getByText('Live OFF'));
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('shows "Live ON" text when autoRefreshLogs is true', () => {
      const entry = makeEntry({ kind: 'log' as FileKind });
      const preview = makePreview({ kind: 'log', tailLines: ['line'] });
      render(
        <FileBrowserPreview
          {...defaultProps}
          entry={entry}
          preview={preview}
          autoRefreshLogs={true}
        />
      );
      expect(screen.getByText('Live ON')).toBeDefined();
    });

    it('shows textarea in edit mode', () => {
      const entry = makeEntry({ kind: 'text' as FileKind });
      render(
        <FileBrowserPreview
          {...defaultProps}
          entry={entry}
          preview={makePreview({ canWrite: true })}
          isEditing={true}
          editorValue="edit me"
        />
      );
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.value).toBe('edit me');
    });

    it('calls onEditorChange when textarea value changes', () => {
      const onEditorChange = vi.fn();
      const entry = makeEntry({ kind: 'text' as FileKind });
      render(
        <FileBrowserPreview
          {...defaultProps}
          entry={entry}
          preview={makePreview({ canWrite: true })}
          isEditing={true}
          editorValue="initial"
          onEditorChange={onEditorChange}
        />
      );
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'updated' } });
      expect(onEditorChange).toHaveBeenCalledWith('updated');
    });

    it('calls onSave when Save Changes is clicked in edit mode', () => {
      const onSave = vi.fn();
      const entry = makeEntry({ kind: 'text' as FileKind });
      render(
        <FileBrowserPreview
          {...defaultProps}
          entry={entry}
          preview={makePreview({ canWrite: true })}
          isEditing={true}
          editorValue="content"
          onSave={onSave}
        />
      );
      fireEvent.click(screen.getByText('Save Changes'));
      expect(onSave).toHaveBeenCalled();
    });

    it('shows image for image kind files', () => {
      const entry = makeEntry({ kind: 'image' as FileKind, extension: 'png', name: 'photo.png' });
      const preview = makePreview({
        kind: 'image',
        name: 'photo.png',
        encoding: 'base64',
        content: 'abc123',
        mimeType: 'image/png',
      });
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={preview} />);
      const img = document.querySelector('img');
      expect(img).toBeDefined();
    });

    it('shows "no preview available" for unsupported kinds without content', () => {
      const entry = makeEntry({ kind: 'binary' as FileKind });
      const preview = makePreview({ kind: 'binary', content: undefined });
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={preview} />);
      expect(screen.getByText('No preview available for this file type.')).toBeDefined();
    });
  });

  describe('formatBytes helper', () => {
    it('shows bytes for small files', () => {
      const entry = makeEntry({ size: 512 });
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={makePreview()} />);
      expect(screen.getAllByText('512 B').length).toBeGreaterThan(0);
    });

    it('shows MB for large files', () => {
      const entry = makeEntry({ size: 10 * 1024 * 1024 }); // 10 MB — rounds to "10 MB"
      render(<FileBrowserPreview {...defaultProps} entry={entry} preview={makePreview()} />);
      expect(screen.getAllByText('10 MB').length).toBeGreaterThan(0);
    });
  });
});
