'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Save, X, Undo2, Redo2, Search, WrapText, Copy, Check, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentOnInput, bracketMatching, foldGutter, syntaxHighlighting, defaultHighlightStyle, LanguageSupport, StreamLanguage } from '@codemirror/language';

import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { sql } from '@codemirror/lang-sql';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { php } from '@codemirror/lang-php';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { shell } from '@codemirror/legacy-modes/mode/shell';

function getLanguageExtension(extension: string): LanguageSupport | null {
    const ext = extension.toLowerCase().replace(/^\./, '');
    switch (ext) {
        case 'js':
        case 'jsx':
        case 'mjs':
        case 'cjs':
            return javascript();
        case 'ts':
        case 'tsx':
        case 'mts':
        case 'cts':
            return javascript({ typescript: true, jsx: ext.includes('x') });
        case 'json':
        case 'jsonc':
        case 'json5':
            return json();
        case 'py':
        case 'pyw':
        case 'pyi':
            return python();
        case 'html':
        case 'htm':
        case 'svelte':
        case 'vue':
            return html();
        case 'css':
        case 'scss':
        case 'less':
            return css();
        case 'md':
        case 'mdx':
        case 'markdown':
            return markdown();
        case 'xml':
        case 'svg':
        case 'xsl':
        case 'xsd':
        case 'plist':
            return xml();
        case 'yml':
        case 'yaml':
            return yaml();
        case 'sql':
        case 'mysql':
        case 'pgsql':
            return sql();
        case 'c':
        case 'h':
        case 'cpp':
        case 'cc':
        case 'cxx':
        case 'hpp':
        case 'hxx':
            return cpp();
        case 'java':
        case 'kt':
        case 'kts':
            return java();
        case 'php':
            return php();
        case 'rs':
            return rust();
        case 'go':
            return go();
        case 'sh':
        case 'bash':
        case 'zsh':
        case 'fish':
            return new LanguageSupport(StreamLanguage.define(shell));
        case 'conf':
        case 'ini':
        case 'env':
        case 'toml':
        case 'cfg':
        case 'log':
        case 'txt':
        case 'gitignore':
        case 'dockerignore':
        case 'editorconfig':
            return null;
        default:
            return null;
    }
}

function getLanguageLabel(extension: string): string {
    const ext = extension.toLowerCase().replace(/^\./, '');
    const labels: Record<string, string> = {
        js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX',
        json: 'JSON', py: 'Python', html: 'HTML', css: 'CSS',
        md: 'Markdown', xml: 'XML', yml: 'YAML', yaml: 'YAML',
        sql: 'SQL', c: 'C', cpp: 'C++', h: 'C Header', java: 'Java',
        php: 'PHP', rs: 'Rust', go: 'Go', sh: 'Shell', bash: 'Bash',
        conf: 'Config', ini: 'INI', env: 'Env', toml: 'TOML',
        svg: 'SVG', scss: 'SCSS', less: 'LESS', vue: 'Vue',
        svelte: 'Svelte', kt: 'Kotlin', txt: 'Plain Text', log: 'Log',
    };
    return labels[ext] || ext.toUpperCase() || 'Plain Text';
}

interface CodeEditorModalProps {
    fileName: string;
    extension: string;
    content: string;
    loading?: boolean;
    saving: boolean;
    onSave: (content: string) => void;
    onClose: () => void;
}

export default function CodeEditorModal({ fileName, extension, content, loading, saving, onSave, onClose }: CodeEditorModalProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const [wordWrap, setWordWrap] = useState(false);
    const [copied, setCopied] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 });

    const handleSave = useCallback(() => {
        if (!viewRef.current) return;
        onSave(viewRef.current.state.doc.toString());
    }, [onSave]);

    useEffect(() => {
        setDirty(false);
        setCursorInfo({ line: 1, col: 1 });
    }, [content]);

    useEffect(() => {
        if (!containerRef.current || loading) return;

        const langExt = getLanguageExtension(extension);
        const extensions = [
            lineNumbers(),
            highlightActiveLine(),
            highlightActiveLineGutter(),
            drawSelection(),
            rectangularSelection(),
            indentOnInput(),
            bracketMatching(),
            foldGutter(),
            highlightSelectionMatches(),
            history(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            oneDark,
            keymap.of([
                ...defaultKeymap,
                ...historyKeymap,
                ...searchKeymap,
                indentWithTab,
                { key: 'Mod-s', run: () => { handleSave(); return true; } },
            ]),
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    setDirty(true);
                }
                if (update.selectionSet || update.docChanged) {
                    const pos = update.state.selection.main.head;
                    const line = update.state.doc.lineAt(pos);
                    setCursorInfo({ line: line.number, col: pos - line.from + 1 });
                }
            }),
        ];

        if (langExt) extensions.push(langExt);
        if (wordWrap) extensions.push(EditorView.lineWrapping);

        const state = EditorState.create({
            doc: content,
            extensions,
        });

        const view = new EditorView({
            state,
            parent: containerRef.current,
        });

        viewRef.current = view;
        view.focus();

        return () => {
            view.destroy();
            viewRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [extension, wordWrap, content, loading]);

    const handleCopy = async () => {
        if (!viewRef.current) return;
        try {
            await navigator.clipboard.writeText(viewRef.current.state.doc.toString());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };

    const handleUndo = () => {
        if (viewRef.current) undo(viewRef.current);
    };

    const handleRedo = () => {
        if (viewRef.current) redo(viewRef.current);
    };

    const handleSearch = () => {
        if (viewRef.current) openSearchPanel(viewRef.current);
    };

    return (
        <div className="fixed inset-0 z-[70] flex flex-col bg-background">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <h2 className="text-sm font-bold text-foreground truncate max-w-[300px]" title={fileName}>
                        {fileName}
                    </h2>
                    <Badge variant="secondary" className="text-[9px] uppercase tracking-widest font-black shrink-0">
                        {getLanguageLabel(extension)}
                    </Badge>
                    {dirty && (
                        <span className="text-[10px] font-semibold text-warning uppercase tracking-wider">Modified</span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleUndo} title="Undo (Cmd+Z)">
                        <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRedo} title="Redo (Cmd+Shift+Z)">
                        <Redo2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSearch} title="Find (Cmd+F)">
                        <Search className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-8 w-8", wordWrap && "bg-primary/10 text-primary")}
                        onClick={() => setWordWrap(!wordWrap)}
                        title="Toggle word wrap"
                    >
                        <WrapText className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} title="Copy all">
                        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <div className="h-5 w-px bg-border mx-1" />
                    <Button
                        size="sm"
                        className="h-8 gap-1.5 shadow-sm"
                        onClick={handleSave}
                        disabled={saving || !dirty}
                    >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Editor area */}
            {loading ? (
                <div className="flex-1 min-h-0 flex items-center justify-center bg-[#282c34]">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                        <span className="text-xs font-medium">Loading file...</span>
                    </div>
                </div>
            ) : (
                <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:!overflow-auto [&_.cm-editor]:outline-none" />
            )}

            {/* Status bar */}
            <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-card text-[10px] font-medium text-muted-foreground shrink-0">
                <div className="flex items-center gap-3">
                    <span>Ln {cursorInfo.line}, Col {cursorInfo.col}</span>
                    <span className="opacity-30">·</span>
                    <span>{getLanguageLabel(extension)}</span>
                    <span className="opacity-30">·</span>
                    <span>UTF-8</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="opacity-50">Cmd+S to save</span>
                    <span className="opacity-50">Cmd+F to search</span>
                </div>
            </div>
        </div>
    );
}
