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
  LanguageSupport,
  StreamLanguage,
} from '@codemirror/language';

import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { shell } from '@codemirror/legacy-modes/mode/shell';

import type { ScriptLanguage } from '../../types';

function getLanguageExtension(
  lang: ScriptLanguage
): LanguageSupport | ReturnType<typeof StreamLanguage.define> {
  switch (lang) {
    case 'python':
      return python();
    case 'node':
      return javascript();
    case 'bash':
    default:
      return StreamLanguage.define(shell);
  }
}

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: ScriptLanguage;
  onRun?: () => void;
  onSave?: () => void;
  className?: string;
  height?: string;
}

export default function ScriptEditor({
  value,
  onChange,
  language,
  onRun,
  onSave,
  className,
  height = '400px',
}: ScriptEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onSaveRef = useRef(onSave);

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [charCount, setCharCount] = useState(value.length);

  onChangeRef.current = onChange;
  onRunRef.current = onRun;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!containerRef.current) return;

    const langExtension = getLanguageExtension(language);

    const customKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          onRunRef.current?.();
          return true;
        },
      },
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
        langCompartment.current.of(langExtension),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        customKeymap,
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            height,
            fontSize: '13px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          },
          '.cm-gutters': {
            borderRight: '1px solid rgba(255,255,255,0.06)',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only init once — value changes are handled by the next effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync language changes
  useEffect(() => {
    if (!viewRef.current) return;
    const langExtension = getLanguageExtension(language);
    viewRef.current.dispatch({
      effects: langCompartment.current.reconfigure(langExtension),
    });
  }, [language]);

  // Sync external value changes (e.g., template selection)
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
          <span className="text-primary/60">{language}</span>
          <span className="font-mono">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono">{charCount.toLocaleString()} chars</span>
          <div className="flex items-center gap-3">
             {onRun && <span className="text-white/20 hover:text-white/40 transition-colors cursor-help" title="Module+Enter">Test Available</span>}
             {onSave && <span className="text-white/20 hover:text-white/40 transition-colors cursor-help" title="Module+S">Save Ready</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
