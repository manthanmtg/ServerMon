'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  indentOnInput,
  bracketMatching,
  foldGutter,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  className?: string;
  height?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  onSave,
  className,
  height = '500px',
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [charCount, setCharCount] = useState(value.length);
  const [wordCount, setWordCount] = useState(0);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!containerRef.current) return;

    const customKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSaveRef.current?.();
          return true;
        },
        preventDefault: true,
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const doc = update.state.doc.toString();
        onChangeRef.current(doc);
        setCharCount(doc.length);
        setWordCount(doc.trim() ? doc.trim().split(/\s+/).length : 0);
      }
      if (update.selectionSet) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        setCursorPos({ line: line.number, col: pos - line.from + 1 });
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        foldGutter(),
        history(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        customKeymap,
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            height,
            fontSize: '14px',
            backgroundColor: 'var(--card)',
            color: 'var(--foreground)',
          },
          '&.cm-focused': {
            outline: 'none',
          },
          '.cm-content': {
            caretColor: 'var(--foreground)',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          },
          '.cm-gutters': {
            backgroundColor: 'color-mix(in srgb, var(--muted) 70%, var(--card))',
            color: 'var(--muted-foreground)',
            borderRight: '1px solid var(--border)',
          },
          '.cm-activeLine': {
            backgroundColor: 'color-mix(in srgb, var(--primary) 8%, transparent)',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'color-mix(in srgb, var(--primary) 8%, transparent)',
          },
          '.cm-line': {
            lineHeight: '1.7',
            color: 'var(--foreground)',
          },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'color-mix(in srgb, var(--primary) 24%, transparent)',
          },
          '.cm-cursor': {
            borderLeftColor: 'var(--foreground)',
          },
          '.cm-foldGutter span': {
            color: 'var(--muted-foreground)',
          },
          '.cm-panels': {
            backgroundColor: 'var(--popover)',
            color: 'var(--popover-foreground)',
            borderColor: 'var(--border)',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    const doc = value;
    setCharCount(doc.length);
    setWordCount(doc.trim() ? doc.trim().split(/\s+/).length : 0);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!viewRef.current) return;
    const currentDoc = viewRef.current.state.doc.toString();
    if (currentDoc !== value) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden border border-border/70 bg-card shadow-xl',
        className
      )}
    >
      <div ref={containerRef} className="[&_.cm-editor]:outline-none" />
      <div className="flex items-center justify-between px-4 py-2 bg-muted/80 border-t border-border/60 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <span className="text-primary">markdown</span>
          <span className="font-mono">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono">{wordCount.toLocaleString()} words</span>
          <span className="font-mono">{charCount.toLocaleString()} chars</span>
        </div>
      </div>
    </div>
  );
}
