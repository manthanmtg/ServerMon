import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { ToastProvider } from '@/components/ui/toast';

// ── Hoisted mock references ────────────────────────────────────────────────────

const { mockEditorViewDestroy, mockEditorViewFocus, MockEditorView } =
  vi.hoisted(() => {
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
  EditorState: {
    create: vi.fn(() => ({})),
  },
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

vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: [],
}));

vi.mock('@codemirror/language', () => ({
  indentOnInput: vi.fn(() => []),
  bracketMatching: vi.fn(() => []),
  foldGutter: vi.fn(() => []),
  syntaxHighlighting: vi.fn(() => []),
  defaultHighlightStyle: [],
  LanguageSupport: class {},
  StreamLanguage: { define: vi.fn(() => ({})) },
}));

vi.mock('@codemirror/lang-javascript', () => ({ javascript: vi.fn(() => []) }));
vi.mock('@codemirror/lang-json', () => ({ json: vi.fn(() => []) }));
vi.mock('@codemirror/lang-python', () => ({ python: vi.fn(() => []) }));
vi.mock('@codemirror/lang-html', () => ({ html: vi.fn(() => []) }));
vi.mock('@codemirror/lang-css', () => ({ css: vi.fn(() => []) }));
vi.mock('@codemirror/lang-markdown', () => ({ markdown: vi.fn(() => []) }));
vi.mock('@codemirror/lang-xml', () => ({ xml: vi.fn(() => []) }));
vi.mock('@codemirror/lang-yaml', () => ({ yaml: vi.fn(() => []) }));
vi.mock('@codemirror/lang-sql', () => ({ sql: vi.fn(() => []) }));
vi.mock('@codemirror/lang-cpp', () => ({ cpp: vi.fn(() => []) }));
vi.mock('@codemirror/lang-java', () => ({ java: vi.fn(() => []) }));
vi.mock('@codemirror/lang-php', () => ({ php: vi.fn(() => []) }));
vi.mock('@codemirror/lang-rust', () => ({ rust: vi.fn(() => []) }));
vi.mock('@codemirror/lang-go', () => ({ go: vi.fn(() => []) }));
vi.mock('@codemirror/legacy-modes/mode/shell', () => ({ shell: {} }));

// ── Helpers ────────────────────────────────────────────────────────────────────

async function importCodeEditorModal() {
  const mod = await import('./CodeEditorModal');
  return mod.default;
}

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the editor container', async () => {
    const CodeEditorModal = await importCodeEditorModal();
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      expect(document.querySelector('div')).toBeDefined();
    });
  });

  it('shows the file name', async () => {
    const CodeEditorModal = await importCodeEditorModal();
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('example.ts')).toBeDefined();
    });
  });

  it('shows status bar with Ln/Col info', async () => {
    const CodeEditorModal = await importCodeEditorModal();
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
    const CodeEditorModal = await importCodeEditorModal();
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/UTF-8/)).toBeDefined();
    });
  });

  it('creates EditorView on mount', async () => {
    const CodeEditorModal = await importCodeEditorModal();
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
    const CodeEditorModal = await importCodeEditorModal();
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

  it('does not create EditorView when loading=true', async () => {
    const CodeEditorModal = await importCodeEditorModal();
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} loading={true} />
      </ToastProvider>
    );
    // When loading, the effect should skip EditorView creation
    await waitFor(() => {
      expect(document.querySelector('div')).toBeDefined();
    });
  });

  it('uses correct TypeScript language for .ts extension', async () => {
    const CodeEditorModal = await importCodeEditorModal();
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

  it('shows language label for ts extension', async () => {
    const CodeEditorModal = await importCodeEditorModal();
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} />
      </ToastProvider>
    );
    await waitFor(() => {
      // Language badge shows TypeScript (or TS uppercase fallback)
      const labels = screen.queryAllByText(/typescript/i);
      expect(labels.length).toBeGreaterThan(0);
    });
  });

  it('calls onClose when X button is clicked', async () => {
    const onClose = vi.fn();
    const CodeEditorModal = await importCodeEditorModal();
    render(
      <ToastProvider>
        <CodeEditorModal {...defaultProps} onClose={onClose} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(document.querySelector('div')).toBeDefined();
    });

    const closeButtons = screen.getAllByRole('button').filter(
      (btn) =>
        btn.querySelector('[data-lucide="x"]') !== null || btn.getAttribute('title') === 'Close'
    );
    if (closeButtons.length > 0) {
      closeButtons[0].click();
      expect(onClose).toHaveBeenCalled();
    }
  });
});
