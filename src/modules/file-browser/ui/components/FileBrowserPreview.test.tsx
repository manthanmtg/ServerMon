import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FileBrowserPreview } from './FileBrowserPreview';
import type { FileEntry, FileKind } from './FileBrowserEntryList';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    unoptimized: _unoptimized,
    ...props
  }: {
    src: string;
    alt: string;
    unoptimized?: boolean;
    [key: string]: unknown;
  }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...(props as React.ImgHTMLAttributes<HTMLImageElement>)} />;
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function makePreview(
  overrides: Partial<{
    path: string;
    name: string;
    kind: FileKind;
    extension: string;
    size: number;
    modifiedAt: string;
    canWrite: boolean;
    permissions: string;
    content: string | undefined;
    truncated: boolean;
    encoding: 'utf8' | 'base64';
    mimeType: string;
    tailLines: string[];
  }> = {}
) {
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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FileBrowserPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty state ───────────────────────────────────────────────────────────────

  it('renders empty state when entry is null', () => {
    render(<FileBrowserPreview {...defaultProps} />);
    expect(screen.getByText('Preview')).toBeDefined();
    expect(screen.getByText(/Select a file to preview/)).toBeDefined();
  });

  it('shows the "Select a file" message when entry is null', () => {
    render(<FileBrowserPreview {...defaultProps} />);
    expect(screen.getByText('Preview')).toBeDefined();
    expect(screen.getByText(/Select a file to preview/)).toBeDefined();
  });

  // ── File name / header ────────────────────────────────────────────────────────

  it('renders file name in header when entry is provided', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ name: 'index.ts' })}
        preview={makePreview({ name: 'index.ts' })}
      />
    );
    expect(screen.getByText('index.ts')).toBeDefined();
  });

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

  it('shows file permissions in metadata', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ permissions: 'rwxr-xr-x' })}
        preview={makePreview({ permissions: 'rwxr-xr-x' })}
      />
    );
    expect(screen.getByText('rwxr-xr-x')).toBeDefined();
  });

  // ── Close button ──────────────────────────────────────────────────────────────

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
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry()}
        preview={makePreview()}
        onClose={onClose}
      />
    );
    const buttons = screen.getAllByRole('button');
    const closeBtn = buttons.find((b) => b.querySelector('svg'));
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  // ── Download button ───────────────────────────────────────────────────────────

  it('shows Download button', () => {
    render(
      <FileBrowserPreview {...defaultProps} entry={makeEntry()} preview={makePreview()} />
    );
    expect(screen.getByText('Download')).toBeDefined();
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

  // ── Edit button ───────────────────────────────────────────────────────────────

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

  it('shows Edit button when file can be written and not already editing', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ canWrite: true })}
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

  it('calls onEdit when Edit button is clicked', () => {
    const onEdit = vi.fn();
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ canWrite: true })}
        preview={makePreview({ canWrite: true })}
        isEditing={false}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalled();
  });

  // ── Loading state ─────────────────────────────────────────────────────────────

  it('shows spinner when loading is true', () => {
    const entry = makeEntry();
    render(
      <FileBrowserPreview {...defaultProps} entry={entry} preview={null} loading={true} />
    );
    expect(document.querySelector('.animate-spin')).toBeDefined();
  });

  it('shows loading spinner when loading is true', () => {
    render(
      <FileBrowserPreview {...defaultProps} entry={makeEntry()} preview={null} loading={true} />
    );
    const spinners = document.querySelectorAll('[data-slot="spinner"], .animate-spin');
    expect(spinners.length).toBeGreaterThan(0);
  });

  // ── Content rendering ─────────────────────────────────────────────────────────

  it('renders text content in pre element', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry()}
        preview={makePreview({ content: 'const x = 42;' })}
      />
    );
    expect(screen.getByText('const x = 42;')).toBeDefined();
  });

  it('shows text content when preview has content', () => {
    const entry = makeEntry({ kind: 'text' as FileKind });
    const preview = makePreview({ content: 'Hello from preview' });
    render(<FileBrowserPreview {...defaultProps} entry={entry} preview={preview} />);
    expect(screen.getByText('Hello from preview')).toBeDefined();
  });

  it('renders truncated warning for large files', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ size: 2097152 })}
        preview={makePreview({ content: 'big file...', truncated: true, size: 2097152 })}
      />
    );
    expect(screen.getByText(/Displaying first/)).toBeDefined();
  });

  it('shows truncation warning when preview.truncated is true', () => {
    const entry = makeEntry({ kind: 'text' as FileKind });
    const preview = makePreview({ truncated: true });
    render(<FileBrowserPreview {...defaultProps} entry={entry} preview={preview} />);
    expect(screen.getByText(/Displaying first/)).toBeDefined();
  });

  // ── Log viewer ────────────────────────────────────────────────────────────────

  it('renders log viewer for log files', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ kind: 'log', name: 'app.log' })}
        preview={makePreview({
          kind: 'log',
          tailLines: ['line 1', 'line 2', 'line 3'],
        })}
      />
    );
    expect(screen.getByText('Log Viewer')).toBeDefined();
    expect(screen.getByText('line 1')).toBeDefined();
    expect(screen.getByText('line 2')).toBeDefined();
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

  it('shows Live ON/OFF toggle in log viewer', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ kind: 'log' })}
        preview={makePreview({ kind: 'log', tailLines: ['log line'] })}
        autoRefreshLogs={false}
      />
    );
    expect(screen.getByText('Live OFF')).toBeDefined();
  });

  it('shows Live ON when autoRefreshLogs is true', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ kind: 'log' })}
        preview={makePreview({ kind: 'log', tailLines: ['log line'] })}
        autoRefreshLogs={true}
      />
    );
    expect(screen.getByText('Live ON')).toBeDefined();
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

  it('calls onToggleAutoRefreshLogs when Live toggle is clicked', () => {
    const onToggle = vi.fn();
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ kind: 'log' })}
        preview={makePreview({ kind: 'log', tailLines: [] })}
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

  // ── Edit mode (textarea) ──────────────────────────────────────────────────────

  it('renders textarea in editing mode', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry()}
        preview={makePreview({ canWrite: true })}
        isEditing={true}
        editorValue="const x = 1;"
      />
    );
    const textarea = document.querySelector('textarea');
    expect(textarea).toBeDefined();
    expect(textarea?.value).toBe('const x = 1;');
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

  it('calls onSave when Save Changes is clicked', () => {
    const onSave = vi.fn();
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry()}
        preview={makePreview({ canWrite: true })}
        isEditing={true}
        editorValue="updated"
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByText('Save Changes'));
    expect(onSave).toHaveBeenCalled();
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

  // ── Image rendering ───────────────────────────────────────────────────────────

  it('renders image using <img> for image files', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ kind: 'image', name: 'photo.png', extension: 'png' })}
        preview={makePreview({
          kind: 'image',
          content: 'base64encodeddata',
          mimeType: 'image/png',
        })}
      />
    );
    const img = document.querySelector('img');
    expect(img).toBeDefined();
    expect(img?.getAttribute('alt')).toBe('example.txt');
  });

  it('shows image for image kind files', () => {
    const entry = makeEntry({
      kind: 'image' as FileKind,
      extension: 'png',
      name: 'photo.png',
    });
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

  // ── Binary / unsupported ──────────────────────────────────────────────────────

  it('renders "no preview available" for binary file types without content', () => {
    render(
      <FileBrowserPreview
        {...defaultProps}
        entry={makeEntry({ kind: 'binary' })}
        preview={makePreview({ kind: 'binary', content: undefined })}
      />
    );
    expect(screen.getByText(/No preview available/)).toBeDefined();
  });

  it('shows "no preview available" for unsupported kinds without content', () => {
    const entry = makeEntry({ kind: 'binary' as FileKind });
    const preview = makePreview({ kind: 'binary', content: undefined });
    render(<FileBrowserPreview {...defaultProps} entry={entry} preview={preview} />);
    expect(screen.getByText('No preview available for this file type.')).toBeDefined();
  });

  // ── formatBytes helper ────────────────────────────────────────────────────────

  it('shows file size in a human-readable format', () => {
    const entry = makeEntry({ size: 2048 });
    render(<FileBrowserPreview {...defaultProps} entry={entry} preview={makePreview()} />);
    expect(screen.getAllByText('2 KB').length).toBeGreaterThan(0);
  });

  it('shows bytes for small files', () => {
    const entry = makeEntry({ size: 512 });
    render(<FileBrowserPreview {...defaultProps} entry={entry} preview={makePreview()} />);
    expect(screen.getAllByText('512 B').length).toBeGreaterThan(0);
  });

  it('shows MB for large files', () => {
    const entry = makeEntry({ size: 10 * 1024 * 1024 });
    render(<FileBrowserPreview {...defaultProps} entry={entry} preview={makePreview()} />);
    expect(screen.getAllByText('10 MB').length).toBeGreaterThan(0);
  });
});
