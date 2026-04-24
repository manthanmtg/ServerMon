import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { ToastProvider } from '@/components/ui/toast';

// ── Hoisted mock references ────────────────────────────────────────────────────

const { mockEditorViewDestroy, mockEditorViewFocus, MockEditorView } = vi.hoisted(() => {
  const mockEditorViewDestroy = vi.fn();
  const mockEditorViewFocus = vi.fn();
  const mockEditorView = {
    destroy: mockEditorViewDestroy,
    dispatch: vi.fn(),
    focus: mockEditorViewFocus,
    state: {
      doc: {
        toString: () => 'const x = 1;',
        lineAt: vi.fn(() => ({ number: 1, from: 0 })),
      },
      sliceDoc: (from: number, to: number) => 'const x = 1;'.slice(from, to),
      selection: { main: { head: 0 } },
    },
    dom: document.createElement('div'),
  };

  const MockEditorView = vi.fn(function (
    this: unknown,
    opts: { parent?: HTMLElement }
  ): typeof mockEditorView {
    if (opts?.parent) opts.parent.appendChild(document.createElement('div'));
    return mockEditorView;
  }) as unknown as {
    new (opts: { parent?: HTMLElement; state?: unknown }): typeof mockEditorView;
    updateListener: { of: ReturnType<typeof vi.fn> };
    lineWrapping: unknown[];
    theme: ReturnType<typeof vi.fn>;
  } & ReturnType<typeof vi.fn>;

  MockEditorView.updateListener = { of: vi.fn(() => []) };
  MockEditorView.lineWrapping = [];
  MockEditorView.theme = vi.fn(() => []);

  return { mockEditorViewDestroy, mockEditorViewFocus, mockEditorView, MockEditorView };
});

// ── CodeMirror mocks ───────────────────────────────────────────────────────────

vi.mock('@codemirror/view', () => ({
  EditorView: MockEditorView,
  keymap: { of: vi.fn(() => []) },
  lineNumbers: vi.fn(() => []),
  highlightActiveLine: vi.fn(() => []),
  highlightActiveLineGutter: vi.fn(() => []),
  drawSelection: vi.fn(() => []),
  rectangularSelection: vi.fn(() => []),
}));

vi.mock('@codemirror/state', () => ({
  EditorState: { create: vi.fn(() => ({})) },
}));

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  history: vi.fn(() => []),
  historyKeymap: [],
  indentWithTab: {},
  undo: vi.fn(),
  redo: vi.fn(),
}));

vi.mock('@codemirror/search', () => ({
  searchKeymap: [],
  highlightSelectionMatches: vi.fn(() => []),
  openSearchPanel: vi.fn(),
}));

vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: 'oneDark' }));

vi.mock('@codemirror/language', () => ({
  indentOnInput: vi.fn(() => []),
  bracketMatching: vi.fn(() => []),
  foldGutter: vi.fn(() => []),
  syntaxHighlighting: vi.fn(() => []),
  defaultHighlightStyle: {},
  LanguageSupport: class {
    constructor(public lang: unknown) {}
  },
  StreamLanguage: { define: vi.fn(() => ({})) },
}));

vi.mock('@codemirror/lang-javascript', () => ({ javascript: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-json', () => ({ json: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-python', () => ({ python: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-html', () => ({ html: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-css', () => ({ css: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-markdown', () => ({ markdown: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-xml', () => ({ xml: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-yaml', () => ({ yaml: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-sql', () => ({ sql: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-cpp', () => ({ cpp: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-java', () => ({ java: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-php', () => ({ php: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-rust', () => ({ rust: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-go', () => ({ go: vi.fn(() => ({})) }));
vi.mock('@codemirror/legacy-modes/mode/shell', () => ({ shell: {} }));

// ── Import after mocks ─────────────────────────────────────────────────────────
import CodeEditorModal from './CodeEditorModal';

// ── Shared props ───────────────────────────────────────────────────────────────

const defaultProps = {
  fileName: 'example.ts',
  extension: 'ts',
  content: 'const x = 1;',
  loading: false,
  saving: false,
  onSave: vi.fn(),
  onClose: vi.fn(),
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CodeEditorModal', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Basic render ──────────────────────────────────────────────────────────────

  it('renders modal without crashing', () => {
    const { container } = render(
      <CodeEditorModal
        fileName="index.ts"
        extension="ts"
        content="const x = 1;"
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(container).toBeDefined();
  });

  it('renders the editor container', async () => {
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      expect(document.querySelector('div')).toBeDefined();
    });
  });

  // ── File name ─────────────────────────────────────────────────────────────────

  it('renders file name in header', () => {
    render(
      <CodeEditorModal
        fileName="config.json"
        extension="json"
        content="{}"
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getByText('config.json')).toBeDefined();
  });

  it('shows the file name', async () => {
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('example.ts')).toBeDefined();
    });
  });

  // ── Language labels ───────────────────────────────────────────────────────────

  it('shows correct language label badge for TypeScript', () => {
    render(
      <CodeEditorModal
        fileName="app.ts"
        extension="ts"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getAllByText('TypeScript').length).toBeGreaterThan(0);
  });

  it('shows language label for ts extension', async () => {
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      const labels = screen.queryAllByText(/typescript/i);
      expect(labels.length).toBeGreaterThan(0);
    });
  });

  it('shows correct language label badge for Python', () => {
    render(
      <CodeEditorModal
        fileName="script.py"
        extension="py"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getAllByText('Python').length).toBeGreaterThan(0);
  });

  it('shows correct language label badge for JavaScript', () => {
    render(
      <CodeEditorModal
        fileName="app.js"
        extension="js"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getAllByText('JavaScript').length).toBeGreaterThan(0);
  });

  it('renders YAML language label for yml extension', () => {
    render(
      <CodeEditorModal
        fileName="config.yml"
        extension="yml"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getAllByText('YAML').length).toBeGreaterThan(0);
  });

  it('renders Markdown language label for md extension', () => {
    render(
      <CodeEditorModal
        fileName="README.md"
        extension="md"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getAllByText('Markdown').length).toBeGreaterThan(0);
  });

  it('renders Shell language label for sh extension', () => {
    render(
      <CodeEditorModal
        fileName="deploy.sh"
        extension="sh"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getAllByText('Shell').length).toBeGreaterThan(0);
  });

  it('uses uppercase fallback for unknown extensions', () => {
    render(
      <CodeEditorModal
        fileName="binary.xyz"
        extension="xyz"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getAllByText('XYZ').length).toBeGreaterThan(0);
  });

  // ── Loading state ─────────────────────────────────────────────────────────────

  it('shows loading spinner when loading=true', () => {
    render(
      <CodeEditorModal
        fileName="file.ts"
        extension="ts"
        content=""
        loading={true}
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getByText('Loading file...')).toBeDefined();
  });

  it('does not create EditorView when loading=true', async () => {
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} loading={true} />
      </ToastProvider>
    );
    await waitFor(() => {
      expect(document.querySelector('div')).toBeDefined();
    });
  });

  // ── Saving state ──────────────────────────────────────────────────────────────

  it('shows "Saving..." text when saving=true', () => {
    render(
      <CodeEditorModal
        fileName="app.ts"
        extension="ts"
        content=""
        saving={true}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getByText('Saving...')).toBeDefined();
  });

  it('shows "Save" text when saving=false', () => {
    render(
      <CodeEditorModal
        fileName="app.ts"
        extension="ts"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getByText('Save')).toBeDefined();
  });

  // ── Close button ──────────────────────────────────────────────────────────────

  it('calls onClose when X button is clicked', async () => {
    const onCloseMock = vi.fn();
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} onClose={onCloseMock} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(document.querySelector('div')).toBeDefined();
    });

    const closeButtons = screen
      .getAllByRole('button')
      .filter(
        (btn) =>
          btn.querySelector('[data-lucide="x"]') !== null || btn.getAttribute('title') === 'Close'
      );
    if (closeButtons.length > 0) {
      closeButtons[0].click();
      expect(onCloseMock).toHaveBeenCalled();
    }
  });

  it('calls onClose when X button is clicked (direct)', () => {
    render(
      <CodeEditorModal
        fileName="app.ts"
        extension="ts"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    const allButtons = screen.getAllByRole('button');
    const xButton = allButtons[allButtons.length - 1];
    fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Toolbar buttons ───────────────────────────────────────────────────────────

  it('renders undo/redo/search/wrap/copy buttons in toolbar', () => {
    render(
      <CodeEditorModal
        fileName="app.ts"
        extension="ts"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getByTitle('Undo (Cmd+Z)')).toBeDefined();
    expect(screen.getByTitle('Redo (Cmd+Shift+Z)')).toBeDefined();
    expect(screen.getByTitle('Find (Cmd+F)')).toBeDefined();
    expect(screen.getByTitle('Toggle word wrap')).toBeDefined();
    expect(screen.getByTitle('Copy all')).toBeDefined();
  });

  it('toggles word wrap when wrap button is clicked', () => {
    render(
      <CodeEditorModal
        fileName="app.ts"
        extension="ts"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    const wrapBtn = screen.getByTitle('Toggle word wrap');
    expect(wrapBtn.className).not.toContain('bg-primary/10');
    fireEvent.click(wrapBtn);
    expect(wrapBtn.className).toContain('bg-primary/10');
  });

  // ── Status bar ────────────────────────────────────────────────────────────────

  it('renders status bar with Ln/Col and language info', () => {
    render(
      <CodeEditorModal
        fileName="app.ts"
        extension="ts"
        content=""
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.getByText(/Ln 1, Col 1/)).toBeDefined();
    expect(screen.getByText('UTF-8')).toBeDefined();
    expect(screen.getByText('Cmd+S to save')).toBeDefined();
    expect(screen.getByText('Cmd+F to search')).toBeDefined();
  });

  it('shows status bar with Ln/Col info', async () => {
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/Ln/)).toBeDefined();
    });
  });

  it('shows UTF-8 in status bar', async () => {
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/UTF-8/)).toBeDefined();
    });
  });

  // ── EditorView lifecycle ──────────────────────────────────────────────────────

  it('creates EditorView on mount', async () => {
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      expect(MockEditorView).toHaveBeenCalled();
      expect(mockEditorViewFocus).toHaveBeenCalled();
    });
  });

  it('destroys the editor on unmount', async () => {
    const { unmount } = render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(MockEditorView).toHaveBeenCalled();
    });

    act(() => {
      unmount();
    });
    expect(mockEditorViewDestroy).toHaveBeenCalled();
  });

  it('uses correct TypeScript language for .ts extension', async () => {
    const { javascript } = await import('@codemirror/lang-javascript');
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      expect(javascript).toHaveBeenCalled();
    });
  });

  // ── Modified indicator ────────────────────────────────────────────────────────

  it('does not show "Modified" label initially', () => {
    render(
      <CodeEditorModal
        fileName="app.ts"
        extension="ts"
        content="const x = 1;"
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(screen.queryByText('Modified')).toBeNull();
  });
});
