'use client';

import { useEffect, useRef } from 'react';
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  StreamLanguage,
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { useTheme } from '@/lib/ThemeContext';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import type { ScriptLanguage } from '../types';

const externalEdit = Annotation.define<boolean>();
const syntaxTheme = new Compartment();
const languageMode = new Compartment();

export default function ScriptEditor({
  language,
  value,
  onChange,
}: {
  value: string;
  language: ScriptLanguage;
  onChange: (text: string) => void;
}) {
  const { theme } = useTheme();
  const original = useRef(value);
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!mount.current) return;
    const editor = new EditorView({
      parent: mount.current,
      state: EditorState.create({
        doc: original.current,
        extensions: [
          lineNumbers(),
          drawSelection(),
          highlightActiveLine(),
          history(),
          bracketMatching(),
          highlightSelectionMatches(),
          languageMode.of([]),
          syntaxTheme.of([]),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.contentAttributes.of({ 'aria-label': 'Script source', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((t) => t.annotation(externalEdit))) {
              onChange(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [onChange]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      annotations: [externalEdit.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  useEffect(() => {
    const highlights = theme.type === 'dark' ? oneDarkHighlightStyle : defaultHighlightStyle;
    view.current?.dispatch({ effects: syntaxTheme.reconfigure(syntaxHighlighting(highlights)) });
  }, [theme.type, onChange]);

  useEffect(() => {
    const extension =
      language === 'python'
        ? python()
        : language === 'node'
          ? javascript()
          : StreamLanguage.define(shell);
    view.current?.dispatch({ effects: languageMode.reconfigure(extension) });
  }, [language, onChange]);

  return <div className="sr-editor" ref={mount} />;
}
