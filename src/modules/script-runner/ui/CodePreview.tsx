'use client';

import { useEffect, useRef } from 'react';
import type { Extension } from '@codemirror/state';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, lineNumbers } from '@codemirror/view';
import {
  StreamLanguage,
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { cpp } from '@codemirror/lang-cpp';
import { css } from '@codemirror/lang-css';
import { go } from '@codemirror/lang-go';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { useTheme } from '@/lib/ThemeContext';

const syntaxTheme = new Compartment();

const codeLanguages = new Map<string, Extension>([
  ['.bash', StreamLanguage.define(shell)],
  ['.c', cpp()],
  ['.cc', cpp()],
  ['.cpp', cpp()],
  ['.css', css()],
  ['.go', go()],
  ['.h', cpp()],
  ['.htm', html()],
  ['.html', html()],
  ['.hpp', cpp()],
  ['.java', java()],
  ['.js', javascript()],
  ['.json', json()],
  ['.jsx', javascript({ jsx: true })],
  ['.md', markdown()],
  ['.mjs', javascript()],
  ['.php', php()],
  ['.py', python()],
  ['.rs', rust()],
  ['.sh', StreamLanguage.define(shell)],
  ['.sql', sql()],
  ['.ts', javascript({ typescript: true })],
  ['.tsx', javascript({ typescript: true, jsx: true })],
  ['.xml', xml()],
  ['.yaml', yaml()],
  ['.yml', yaml()],
  ['.zsh', StreamLanguage.define(shell)],
]);

export function codeLanguageFor(extension: string): Extension | undefined {
  return codeLanguages.get(extension);
}

export default function CodePreview({ doc, language }: { doc: string; language: Extension }) {
  const { theme } = useTheme();
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!mount.current) return;
    const editor = new EditorView({
      parent: mount.current,
      state: EditorState.create({
        doc,
        extensions: [
          lineNumbers(),
          drawSelection(),
          bracketMatching(),
          EditorView.theme({
            '&': { maxHeight: 'min(55dvh, 440px)', fontSize: '13px' },
            '.cm-scroller': { overflow: 'auto' },
          }),
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          EditorView.contentAttributes.of({ spellcheck: 'false' }),
          language,
          syntaxTheme.of(syntaxHighlighting(defaultHighlightStyle)),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [doc, language]);

  useEffect(() => {
    const highlights = theme.type === 'dark' ? oneDarkHighlightStyle : defaultHighlightStyle;
    view.current?.dispatch({
      effects: syntaxTheme.reconfigure(syntaxHighlighting(highlights)),
    });
  }, [theme.type]);

  return <div className="min-w-0" ref={mount} />;
}
