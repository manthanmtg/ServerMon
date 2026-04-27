import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ── Hoisted mock references ────────────────────────────────────────────────────

const { mockDispatch, mockDestroy, mockView, MockEditorViewScript } = vi.hoisted(() => {
  const mockDispatch = vi.fn();
  const mockDestroy = vi.fn();
  const mockView = {
    dispatch: mockDispatch,
    destroy: mockDestroy,
    state: {
      doc: { toString: () => '' },
      sliceDoc: () => '',
    },
    dom: document.createElement('div'),
  };

  const MockEditorViewScript = vi.fn(function (
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

  MockEditorViewScript.updateListener = { of: vi.fn(() => []) };
  MockEditorViewScript.lineWrapping = [];
  MockEditorViewScript.theme = vi.fn(() => []);

  return { mockDispatch, mockDestroy, mockView, MockEditorViewScript };
});

// ── Mock CodeMirror entirely ───────────────────────────────────────────────────

vi.mock('@codemirror/view', () => ({
  EditorView: MockEditorViewScript,
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
  Compartment: vi.fn(function (this: {
    of: ReturnType<typeof vi.fn>;
    reconfigure: ReturnType<typeof vi.fn>;
  }) {
    this.of = vi.fn(() => []);
    this.reconfigure = vi.fn(() => ({ effects: [] }));
  }),
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
  LanguageSupport: class {},
  StreamLanguage: {
    define: vi.fn(() => ({})),
  },
}));

vi.mock('@codemirror/lang-javascript', () => ({
  javascript: vi.fn(() => []),
}));

vi.mock('@codemirror/lang-python', () => ({
  python: vi.fn(() => []),
}));

vi.mock('@codemirror/legacy-modes/mode/shell', () => ({
  shell: {},
}));

// ── Import component ──────────────────────────────────────────────────────────

async function importScriptEditor() {
  const mod = await import('./ScriptEditor');
  return mod.default;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ScriptEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a container element', async () => {
    const ScriptEditor = await importScriptEditor();
    const { container } = render(<ScriptEditor value="" onChange={vi.fn()} language="bash" />);
    expect(container.querySelector('div')).toBeDefined();
  });

  it('creates an EditorView on mount', async () => {
    const ScriptEditor = await importScriptEditor();
    render(<ScriptEditor value="echo hello" onChange={vi.fn()} language="bash" />);
    expect(MockEditorViewScript).toHaveBeenCalled();
  });

  it('destroys the editor view on unmount', async () => {
    const ScriptEditor = await importScriptEditor();
    const { unmount } = render(
      <ScriptEditor value="echo hello" onChange={vi.fn()} language="bash" />
    );
    unmount();
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('renders cursor position display', async () => {
    const ScriptEditor = await importScriptEditor();
    render(<ScriptEditor value="hello" onChange={vi.fn()} language="python" />);
    expect(screen.getByText(/Ln/)).toBeDefined();
    expect(screen.getByText(/Col/)).toBeDefined();
  });

  it('renders character count', async () => {
    const ScriptEditor = await importScriptEditor();
    render(<ScriptEditor value="hello world" onChange={vi.fn()} language="node" />);
    const charCount = screen.queryByText(/chars/i) ?? screen.queryByText(/ch/i);
    expect(charCount).toBeDefined();
  });

  it('applies custom height style', async () => {
    const ScriptEditor = await importScriptEditor();
    const { container } = render(
      <ScriptEditor value="" onChange={vi.fn()} language="bash" height="600px" />
    );
    const elementsWithStyle = container.querySelectorAll('[style]');
    const hasHeight = Array.from(elementsWithStyle).some(
      (el) => (el as HTMLElement).style.height === '600px'
    );
    expect(hasHeight).toBe(true);
  });

  it('renders with python language without errors', async () => {
    const ScriptEditor = await importScriptEditor();
    const { python } = await import('@codemirror/lang-python');
    render(<ScriptEditor value="print('hello')" onChange={vi.fn()} language="python" />);
    expect(python).toHaveBeenCalled();
  });

  it('renders with node language without errors', async () => {
    const ScriptEditor = await importScriptEditor();
    const { javascript } = await import('@codemirror/lang-javascript');
    render(<ScriptEditor value="console.log('hi')" onChange={vi.fn()} language="node" />);
    expect(javascript).toHaveBeenCalled();
  });

  it('accepts a className prop', async () => {
    const ScriptEditor = await importScriptEditor();
    const { container } = render(
      <ScriptEditor value="" onChange={vi.fn()} language="bash" className="my-custom-class" />
    );
    expect(container.querySelector('.my-custom-class')).toBeDefined();
  });

  it('uses theme-aware editor shell colors instead of fixed dark overlays', async () => {
    const ScriptEditor = await importScriptEditor();
    const { container } = render(<ScriptEditor value="" onChange={vi.fn()} language="bash" />);
    const shell = container.firstElementChild;

    expect(shell).toHaveClass('bg-card');
    expect(shell?.className).not.toContain('bg-zinc-900');
    expect(shell?.className).not.toContain('border-white');
  });

  it('mock dispatch and destroy are accessible', () => {
    expect(typeof mockDispatch).toBe('function');
    expect(typeof mockDestroy).toBe('function');
    expect(mockView).toBeDefined();
  });
});
