import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDestroy, MockEditorView } = vi.hoisted(() => {
  const mockDestroy = vi.fn();
  const mockView = {
    destroy: mockDestroy,
    dispatch: vi.fn(),
    state: {
      doc: { toString: () => '' },
    },
  };

  const MockEditorView = vi.fn(function (
    this: unknown,
    opts: { parent?: HTMLElement }
  ): typeof mockView {
    if (opts?.parent) opts.parent.appendChild(document.createElement('div'));
    return mockView;
  }) as unknown as {
    new (opts: { parent?: HTMLElement }): typeof mockView;
    updateListener: { of: ReturnType<typeof vi.fn> };
    lineWrapping: unknown[];
    theme: ReturnType<typeof vi.fn>;
  } & ReturnType<typeof vi.fn>;

  MockEditorView.updateListener = { of: vi.fn(() => []) };
  MockEditorView.lineWrapping = [];
  MockEditorView.theme = vi.fn(() => []);

  return { mockDestroy, MockEditorView };
});

vi.mock('@codemirror/view', () => ({
  EditorView: MockEditorView,
  keymap: { of: vi.fn(() => []) },
  lineNumbers: vi.fn(() => []),
  highlightActiveLine: vi.fn(() => []),
  highlightActiveLineGutter: vi.fn(() => []),
  drawSelection: vi.fn(() => []),
}));

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn(() => ({ doc: { toString: () => '' } })),
  },
}));

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  history: vi.fn(() => []),
  historyKeymap: [],
  indentWithTab: {},
}));

vi.mock('@codemirror/search', () => ({
  searchKeymap: [],
  highlightSelectionMatches: vi.fn(() => []),
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
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: vi.fn(() => []),
  markdownLanguage: {},
}));

vi.mock('@codemirror/language-data', () => ({
  languages: [],
}));

async function importMarkdownEditor() {
  const mod = await import('./MarkdownEditor');
  return mod.default;
}

describe('MarkdownEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses theme-aware editor shell colors instead of fixed dark overlays', async () => {
    const MarkdownEditor = await importMarkdownEditor();
    const { container } = render(<MarkdownEditor value="" onChange={vi.fn()} />);
    const shell = container.firstElementChild;

    expect(shell).toHaveClass('bg-card');
    expect(shell?.className).not.toContain('bg-[#1e1e2e]');
    expect(shell?.className).not.toContain('border-white');
  });

  it('destroys the editor view on unmount', async () => {
    const MarkdownEditor = await importMarkdownEditor();
    const { unmount } = render(<MarkdownEditor value="" onChange={vi.fn()} />);

    unmount();

    expect(mockDestroy).toHaveBeenCalled();
  });
});
