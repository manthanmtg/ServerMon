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
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
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
        oneDark,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        customKeymap,
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            height,
            fontSize: '14px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          },
          '.cm-gutters': {
            borderRight: '1px solid rgba(255,255,255,0.06)',
          },
          '.cm-line': {
            lineHeight: '1.7',
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
    <div className={cn('rounded-2xl overflow-hidden border border-border/40 bg-[#1e1e2e] shadow-xl', className)}>
      <div ref={containerRef} className="[&_.cm-editor]:outline-none" />
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a26] border-t border-white/5 text-[10px] font-bold text-white/40 uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <span className="text-primary/60">markdown</span>
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
