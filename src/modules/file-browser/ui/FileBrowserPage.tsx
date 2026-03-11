'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowLeft,
    ArrowRight,
    CheckSquare,
    ChevronRight,
    Copy,
    Download,
    Eye,
    FileCode2,
    FileImage,
    FileText,
    Folder,
    FolderOpen,
    FolderPlus,
    GitBranch,
    LoaderCircle,
    Logs,
    PanelLeftClose,
    PanelLeftOpen,
    Pencil,
    Plus,
    RefreshCcw,
    Save,
    Search,
    Settings2,
    Square,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import FileBrowserSettingsModal, { FileBrowserSettings } from './FileBrowserSettingsModal';

interface GitInfo {
    root: string;
    branch: string;
    dirty: boolean;
    changedFiles: number;
}

interface FileEntry {
    name: string;
    path: string;
    parentPath: string;
    extension: string;
    isDirectory: boolean;
    size: number;
    modifiedAt: string;
    permissions: string;
    canRead: boolean;
    canWrite: boolean;
    kind: 'directory' | 'image' | 'log' | 'archive' | 'code' | 'text' | 'binary';
}

interface DirectoryListing {
    path: string;
    name: string;
    parentPath: string | null;
    entries: FileEntry[];
    summary: {
        directories: number;
        files: number;
        totalSize: number;
    };
    git: GitInfo | null;
}

interface PreviewFile {
    path: string;
    name: string;
    kind: FileEntry['kind'];
    extension: string;
    size: number;
    modifiedAt: string;
    canWrite: boolean;
    permissions: string;
    content?: string;
    truncated?: boolean;
    encoding?: 'utf8' | 'base64';
    mimeType?: string;
    tailLines?: string[];
}

interface TreeNode {
    name: string;
    path: string;
    hasChildren: boolean;
    children?: TreeNode[];
}

type DialogState =
    | { kind: 'create'; entryKind: 'file' | 'directory' }
    | { kind: 'rename'; entry: FileEntry }
    | { kind: 'delete'; entries: FileEntry[] }
    | null;

const DEFAULT_SETTINGS: FileBrowserSettings = {
    shortcuts: [
        { id: 'root', label: 'Root', path: '/' },
        { id: 'home', label: 'Home', path: '/root' },
    ],
    defaultPath: '/',
    editorMaxBytes: 1024 * 1024,
    previewMaxBytes: 512 * 1024,
};

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = -1;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function matchesFilter(name: string, filter: string) {
    if (!filter.trim()) return true;
    const escaped = filter
        .trim()
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(escaped, 'i').test(name);
}

function buildSegments(currentPath: string) {
    const parts = currentPath.split('/').filter(Boolean);
    const segments = [{ label: 'Root', path: '/' }];
    let running = '';
    for (const part of parts) {
        running = `${running}/${part}`;
        segments.push({ label: part, path: running || '/' });
    }
    return segments;
}

function fileIcon(entry: Pick<FileEntry, 'isDirectory' | 'kind'>) {
    if (entry.isDirectory) return Folder;
    if (entry.kind === 'image') return FileImage;
    if (entry.kind === 'code') return FileCode2;
    if (entry.kind === 'log') return Logs;
    return FileText;
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, init);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }
    return data as T;
}

function Overlay({
    children,
    onClose,
    labelledBy,
    widthClass = 'max-w-xl',
}: {
    children: React.ReactNode;
    onClose: () => void;
    labelledBy: string;
    widthClass?: string;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="presentation"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            <div
                className={cn('relative w-full rounded-xl border border-border bg-card shadow-xl', widthClass)}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                onClick={(event) => event.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}

function TreeBranch({
    node,
    currentPath,
    expanded,
    loadingPaths,
    onToggle,
    onSelect,
}: {
    node: TreeNode;
    currentPath: string;
    expanded: Set<string>;
    loadingPaths: Set<string>;
    onToggle: (path: string, isExpanded: boolean) => void;
    onSelect: (path: string) => void;
}) {
    const isExpanded = expanded.has(node.path);
    const isActive = currentPath === node.path;

    return (
        <div className="space-y-1" role="treeitem" aria-expanded={isExpanded} aria-selected={isActive}>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    className="min-h-[32px] min-w-[32px] rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex items-center justify-center"
                    onClick={() => onToggle(node.path, isExpanded)}
                    disabled={!node.hasChildren && !node.children?.length}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name || node.path}`}
                >
                    <ChevronRight className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-90')} />
                </button>
                <button
                    type="button"
                    onClick={() => onSelect(node.path)}
                    className={cn(
                        'flex min-h-[36px] flex-1 items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors',
                        isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                    title={node.path}
                    aria-current={isActive ? 'page' : undefined}
                    data-testid={`tree-node-${node.path}`}
                >
                    {isExpanded ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{node.name || node.path}</span>
                    {loadingPaths.has(node.path) && <LoaderCircle className="ml-auto h-3.5 w-3.5 animate-spin" />}
                </button>
            </div>
            {isExpanded && node.children && (
                <div className="ml-5 border-l border-border pl-2" role="group">
                    {node.children.map((child) => (
                        <TreeBranch
                            key={child.path}
                            node={child}
                            currentPath={currentPath}
                            expanded={expanded}
                            loadingPaths={loadingPaths}
                            onToggle={onToggle}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function FileOperationDialog({
    state,
    onClose,
    onConfirm,
    busy,
}: {
    state: DialogState;
    onClose: () => void;
    onConfirm: (payload: { name?: string; content?: string }) => Promise<void>;
    busy: boolean;
}) {
    const [name, setName] = useState(state?.kind === 'rename' ? state.entry.name : '');
    const [content, setContent] = useState('');

    if (!state) return null;

    const titleId = `file-browser-dialog-${state.kind}`;
    const isCreateFile = state.kind === 'create' && state.entryKind === 'file';

    return (
        <Overlay onClose={busy ? () => {} : onClose} labelledBy={titleId}>
            <div className="flex items-center justify-between border-b border-border p-5">
                <div>
                    <h3 id={titleId} className="text-base font-semibold text-foreground">
                        {state.kind === 'create' && state.entryKind === 'file' && 'Create File'}
                        {state.kind === 'create' && state.entryKind === 'directory' && 'Create Folder'}
                        {state.kind === 'rename' && 'Rename Entry'}
                        {state.kind === 'delete' && (state.entries.length > 1 ? 'Delete Selected Entries' : 'Delete Entry')}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {state.kind === 'delete'
                            ? 'This action cannot be undone.'
                            : 'Changes are applied immediately on the server.'}
                    </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label="Close dialog">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="space-y-4 p-5">
                {state.kind === 'delete' ? (
                    <div className="rounded-xl border border-border bg-secondary/20 p-4 text-sm text-foreground">
                        <p className="font-medium">
                            {state.entries.length > 1
                                ? `Delete ${state.entries.length} selected entries?`
                                : `Delete ${state.entries[0]?.name}?`}
                        </p>
                        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                            {state.entries.slice(0, 6).map((entry) => (
                                <p key={entry.path}>{entry.path}</p>
                            ))}
                            {state.entries.length > 6 && <p>…and {state.entries.length - 6} more</p>}
                        </div>
                    </div>
                ) : (
                    <>
                        <Input
                            label="Name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={state.kind === 'create' ? 'example.txt' : undefined}
                            autoFocus
                        />
                        {isCreateFile && (
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-foreground" htmlFor="new-file-content">
                                    Initial content
                                </label>
                                <textarea
                                    id="new-file-content"
                                    value={content}
                                    onChange={(event) => setContent(event.target.value)}
                                    className="min-h-[10rem] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/40"
                                    spellCheck={false}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border p-5">
                <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                <Button
                    variant={state.kind === 'delete' ? 'destructive' : 'default'}
                    loading={busy}
                    onClick={() => onConfirm({ name, content })}
                    disabled={state.kind !== 'delete' && !name.trim()}
                >
                    {state.kind === 'delete' ? 'Delete' : 'Confirm'}
                </Button>
            </div>
        </Overlay>
    );
}

function renderPreviewContent({
    isEditing,
    editorValue,
    onEditorChange,
    preview,
    onOpenLightbox,
}: {
    isEditing: boolean;
    editorValue: string;
    onEditorChange: (value: string) => void;
    preview: PreviewFile;
    onOpenLightbox: () => void;
}) {
    if (isEditing) {
        return (
            <textarea
                value={editorValue}
                onChange={(event) => onEditorChange(event.target.value)}
                className="min-h-[28rem] w-full rounded-xl border border-border bg-background p-4 font-mono text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
                spellCheck={false}
                data-testid="editor-textarea"
            />
        );
    }

    if (preview.kind === 'image' && preview.content) {
        return (
            <button
                type="button"
                className="overflow-hidden rounded-xl border border-border bg-secondary/20 p-3 text-left"
                onClick={onOpenLightbox}
                aria-label="Open image preview"
            >
                <Image
                    src={`data:${preview.mimeType || 'image/png'};base64,${preview.content}`}
                    alt={preview.name}
                    width={1600}
                    height={1200}
                    unoptimized
                    className="max-h-[32rem] w-full rounded-lg object-contain"
                />
            </button>
        );
    }

    if (preview.kind === 'log' && preview.tailLines) {
        return (
            <div className="overflow-hidden rounded-xl border border-border bg-[#0b1020] text-slate-200">
                <div className="border-b border-white/10 px-4 py-2 text-xs text-slate-400">Tail view</div>
                <div className="max-h-[32rem] overflow-auto p-4 font-mono text-xs leading-6" data-testid="log-preview">
                    {preview.tailLines.map((line, index) => (
                        <div key={`${index}-${line.slice(0, 24)}`} className="grid grid-cols-[44px,minmax(0,1fr)] gap-3">
                            <span className="text-slate-500">{index + 1}</span>
                            <span className="break-all">{line || ' '}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (preview.content && preview.encoding === 'utf8') {
        return (
            <div className="overflow-hidden rounded-xl border border-border bg-[#0b1020] text-slate-200">
                <div className="border-b border-white/10 px-4 py-2 text-xs text-slate-400">
                    {preview.mimeType || 'Text preview'}
                </div>
                <div className="max-h-[32rem] overflow-auto p-4 font-mono text-xs leading-6" data-testid="text-preview">
                    {preview.content.split('\n').map((line, index) => (
                        <div key={`${index}-${line.slice(0, 24)}`} className="grid grid-cols-[44px,minmax(0,1fr)] gap-3">
                            <span className="select-none text-slate-500">{index + 1}</span>
                            <span className="break-all">{line || ' '}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (preview.kind === 'image' && !preview.content) {
        return (
            <div className="rounded-xl border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                Image preview is unavailable because the file exceeds the preview limit.
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
            Binary preview is not supported for this file type. Use download or open the file from the terminal.
        </div>
    );
}

export function FileBrowserHeaderShortcuts() {
    const router = useRouter();
    const pathname = usePathname();
    const [settings, setSettings] = useState<FileBrowserSettings>(DEFAULT_SETTINGS);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchJson<{ settings: FileBrowserSettings }>('/api/modules/file-browser/settings');
                setSettings(data.settings);
            } catch {
                setSettings(DEFAULT_SETTINGS);
            }
        };

        const handleUpdated = (event: Event) => {
            const customEvent = event as CustomEvent<FileBrowserSettings>;
            if (customEvent.detail) setSettings(customEvent.detail);
        };

        void load();
        window.addEventListener('file-browser-shortcuts-updated', handleUpdated);
        return () => window.removeEventListener('file-browser-shortcuts-updated', handleUpdated);
    }, []);

    if (pathname !== '/file-browser') {
        return null;
    }

    return (
        <>
            {settings.shortcuts.slice(0, 6).map((shortcut) => (
                <button
                    key={shortcut.id}
                    onClick={() => router.push(`/file-browser?path=${encodeURIComponent(shortcut.path)}`)}
                    className="h-8 max-w-[9rem] rounded-lg border border-border bg-secondary/50 px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors truncate"
                    title={shortcut.path}
                >
                    {shortcut.label}
                </button>
            ))}
        </>
    );
}

export default function FileBrowserPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialPath = searchParams.get('path') || '';
    const [settings, setSettings] = useState<FileBrowserSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [listing, setListing] = useState<DirectoryListing | null>(null);
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['/']));
    const [loadingTreePaths, setLoadingTreePaths] = useState<Set<string>>(new Set());
    const [currentPath, setCurrentPath] = useState(initialPath || DEFAULT_SETTINGS.defaultPath);
    const [search, setSearch] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
    const [preview, setPreview] = useState<PreviewFile | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [editorValue, setEditorValue] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showTree, setShowTree] = useState(true);
    const [showMobileTree, setShowMobileTree] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [treeRoots, setTreeRoots] = useState<string[]>(['/']);
    const [dialogState, setDialogState] = useState<DialogState>(null);
    const [dialogBusy, setDialogBusy] = useState(false);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [activeRowPath, setActiveRowPath] = useState<string | null>(null);
    const historyIndexRef = useRef(-1);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    const filteredEntries = useMemo(() => (
        listing?.entries.filter((entry) => matchesFilter(entry.name, search)) || []
    ), [listing?.entries, search]);

    const selectedEntries = useMemo(() => {
        const byPath = new Map((listing?.entries || []).map((entry) => [entry.path, entry]));
        return Array.from(selectedPaths).map((entryPath) => byPath.get(entryPath)).filter(Boolean) as FileEntry[];
    }, [listing?.entries, selectedPaths]);

    const [scrollTop, setScrollTop] = useState(0);
    const rowHeight = 56;
    const visibleHeight = 560;
    const useVirtualization = filteredEntries.length > 200;
    const startIndex = useVirtualization ? Math.max(0, Math.floor(scrollTop / rowHeight) - 8) : 0;
    const visibleCount = useVirtualization ? Math.ceil(visibleHeight / rowHeight) + 16 : filteredEntries.length;
    const visibleEntries = useVirtualization ? filteredEntries.slice(startIndex, startIndex + visibleCount) : filteredEntries;
    const breadcrumbs = useMemo(() => buildSegments(currentPath), [currentPath]);

    const mergeTreeNode = useCallback((nodes: TreeNode[], pathToReplace: string, children: TreeNode[] | undefined): TreeNode[] => (
        nodes.map((node) => {
            if (node.path === pathToReplace) {
                return { ...node, children };
            }
            return node.children ? { ...node, children: mergeTreeNode(node.children, pathToReplace, children) } : node;
        })
    ), []);

    const loadSettings = useCallback(async () => {
        try {
            const data = await fetchJson<{ settings: FileBrowserSettings }>('/api/modules/file-browser/settings');
            setSettings(data.settings);
            setTreeRoots(Array.from(new Set(data.settings.shortcuts.map((shortcut) => shortcut.path).concat('/'))));
            if (!initialPath) {
                setCurrentPath(data.settings.defaultPath || '/');
            }
        } catch {
            setSettings(DEFAULT_SETTINGS);
            setTreeRoots(Array.from(new Set(DEFAULT_SETTINGS.shortcuts.map((shortcut) => shortcut.path).concat('/'))));
        }
    }, [initialPath]);

    const loadListing = useCallback(async (nextPath: string, pushHistory = false) => {
        setLoading(true);
        try {
            const data = await fetchJson<{ listing: DirectoryListing }>(`/api/modules/file-browser?path=${encodeURIComponent(nextPath)}`);
            setListing(data.listing);
            setCurrentPath(data.listing.path);
            setSelectedPaths((current) => {
                const validPaths = new Set(data.listing.entries.map((entry) => entry.path));
                return new Set(Array.from(current).filter((entryPath) => validPaths.has(entryPath)));
            });

            if (selectedEntry && selectedEntry.parentPath !== data.listing.path) {
                setSelectedEntry(null);
                setPreview(null);
                setIsEditing(false);
            }

            if (pushHistory) {
                setHistory((current) => {
                    const trimmed = current.slice(0, historyIndexRef.current + 1);
                    const nextHistory = trimmed[trimmed.length - 1] === data.listing.path
                        ? trimmed
                        : [...trimmed, data.listing.path];
                    const nextIndex = nextHistory.length - 1;
                    historyIndexRef.current = nextIndex;
                    setHistoryIndex(nextIndex);
                    return nextHistory;
                });
            } else if (historyIndexRef.current < 0) {
                historyIndexRef.current = 0;
                setHistory([data.listing.path]);
                setHistoryIndex(0);
            }
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Failed to load directory', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [selectedEntry, toast]);

    const loadTreeRoot = useCallback(async (rootPath: string) => {
        try {
            const data = await fetchJson<{ tree: TreeNode }>(`/api/modules/file-browser?mode=tree&depth=1&path=${encodeURIComponent(rootPath)}`);
            setTree((current) => {
                const next = current.filter((node) => node.path !== rootPath);
                return [...next, data.tree].sort((left, right) => left.path.localeCompare(right.path));
            });
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Failed to load tree', variant: 'destructive' });
        }
    }, [toast]);

    const loadTreeChildren = useCallback(async (nodePath: string) => {
        setLoadingTreePaths((current) => new Set([...current, nodePath]));
        try {
            const data = await fetchJson<{ tree: TreeNode }>(`/api/modules/file-browser?mode=tree&depth=1&path=${encodeURIComponent(nodePath)}`);
            setTree((current) => mergeTreeNode(current, nodePath, data.tree.children));
        } catch {
            toast({ title: 'Failed to load tree branch', variant: 'destructive' });
        } finally {
            setLoadingTreePaths((current) => {
                const next = new Set(current);
                next.delete(nodePath);
                return next;
            });
        }
    }, [mergeTreeNode, toast]);

    const loadPreview = useCallback(async (entry: FileEntry, editMode = false) => {
        setSelectedEntry(entry);
        setPreviewLoading(true);
        setIsEditing(false);
        try {
            const action = editMode ? 'edit' : 'preview';
            const data = await fetchJson<{ file: PreviewFile }>(`/api/modules/file-browser/file?path=${encodeURIComponent(entry.path)}&action=${action}`);
            setPreview(data.file);
            if (editMode) {
                setEditorValue(data.file.content || '');
                setIsEditing(true);
            }
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Failed to load preview', variant: 'destructive' });
        } finally {
            setPreviewLoading(false);
        }
    }, [toast]);

    const navigate = useCallback((nextPath: string, pushHistory = true) => {
        router.replace(`/file-browser?path=${encodeURIComponent(nextPath)}`);
        void loadListing(nextPath, pushHistory);
        setShowMobileTree(false);
    }, [loadListing, router]);

    const refresh = useCallback(() => {
        void loadListing(currentPath, false);
        if (selectedEntry && selectedEntry.parentPath === currentPath) {
            void loadPreview(selectedEntry, isEditing);
        }
        treeRoots.forEach((rootPath) => {
            void loadTreeRoot(rootPath);
        });
    }, [currentPath, isEditing, loadListing, loadPreview, loadTreeRoot, selectedEntry, treeRoots]);

    const openDeleteDialog = useCallback((entries: FileEntry[]) => {
        if (entries.length === 0) return;
        setDialogState({ kind: 'delete', entries });
    }, []);

    const handleCopyPath = useCallback(async (entry: FileEntry) => {
        try {
            await navigator.clipboard.writeText(entry.path);
            toast({ title: 'Path copied', variant: 'success' });
        } catch {
            toast({ title: 'Clipboard unavailable', variant: 'warning' });
        }
    }, [toast]);

    const handleDownload = useCallback((entry: FileEntry) => {
        window.open(`/api/modules/file-browser/file?path=${encodeURIComponent(entry.path)}&action=download`, '_blank', 'noopener,noreferrer');
    }, []);

    const handleSave = useCallback(async () => {
        if (!selectedEntry) return;
        setSaving(true);
        try {
            await fetchJson('/api/modules/file-browser/file', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: selectedEntry.path, content: editorValue }),
            });
            toast({ title: 'File saved', variant: 'success' });
            setIsEditing(false);
            void loadPreview(selectedEntry, false);
            refresh();
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Save failed', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    }, [editorValue, loadPreview, refresh, selectedEntry, toast]);

    const uploadFiles = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const formData = new FormData();
        formData.append('path', currentPath);
        Array.from(files).forEach((file) => formData.append('files', file));

        setUploadProgress(0);
        const request = new XMLHttpRequest();
        request.open('POST', '/api/modules/file-browser/upload');

        request.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                setUploadProgress(Math.round((event.loaded / event.total) * 100));
            }
        };

        request.onload = () => {
            if (request.status >= 200 && request.status < 300) {
                toast({ title: `${files.length} file${files.length === 1 ? '' : 's'} uploaded`, variant: 'success' });
                refresh();
            } else {
                try {
                    const data = JSON.parse(request.responseText) as { error?: string };
                    toast({ title: data.error || 'Upload failed', variant: 'destructive' });
                } catch {
                    toast({ title: 'Upload failed', variant: 'destructive' });
                }
            }
            setUploadProgress(0);
        };

        request.onerror = () => {
            toast({ title: 'Upload failed', variant: 'destructive' });
            setUploadProgress(0);
        };

        request.send(formData);
    }, [currentPath, refresh, toast]);

    const handleHistoryMove = useCallback((direction: -1 | 1) => {
        const nextIndex = historyIndex + direction;
        if (nextIndex < 0 || nextIndex >= history.length) return;
        historyIndexRef.current = nextIndex;
        setHistoryIndex(nextIndex);
        navigate(history[nextIndex], false);
    }, [history, historyIndex, navigate]);

    const handleDialogConfirm = useCallback(async ({ name, content }: { name?: string; content?: string }) => {
        if (!dialogState) return;
        setDialogBusy(true);
        try {
            if (dialogState.kind === 'create') {
                await fetchJson('/api/modules/file-browser', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parentPath: currentPath,
                        name,
                        kind: dialogState.entryKind,
                        content: dialogState.entryKind === 'file' ? content || '' : undefined,
                    }),
                });
                toast({
                    title: dialogState.entryKind === 'file' ? 'File created' : 'Folder created',
                    variant: 'success',
                });
            }

            if (dialogState.kind === 'rename') {
                const data = await fetchJson<{ path: string }>('/api/modules/file-browser', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: dialogState.entry.path, name }),
                });
                if (selectedEntry?.path === dialogState.entry.path) {
                    setSelectedEntry({ ...dialogState.entry, path: data.path, name: name || dialogState.entry.name });
                }
                toast({ title: 'Entry renamed', variant: 'success' });
            }

            if (dialogState.kind === 'delete') {
                for (const entry of dialogState.entries) {
                    await fetchJson('/api/modules/file-browser', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: entry.path }),
                    });
                }
                setSelectedPaths(new Set());
                if (selectedEntry && dialogState.entries.some((entry) => entry.path === selectedEntry.path)) {
                    setSelectedEntry(null);
                    setPreview(null);
                    setIsEditing(false);
                }
                toast({
                    title: dialogState.entries.length > 1 ? 'Entries deleted' : 'Entry deleted',
                    variant: 'success',
                });
            }

            setDialogState(null);
            refresh();
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Action failed', variant: 'destructive' });
        } finally {
            setDialogBusy(false);
        }
    }, [currentPath, dialogState, refresh, selectedEntry, toast]);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        const nextPath = initialPath || settings.defaultPath || '/';
        void loadListing(nextPath, false);
    }, [initialPath, loadListing, settings.defaultPath]);

    useEffect(() => {
        treeRoots.forEach((rootPath) => {
            void loadTreeRoot(rootPath);
        });
    }, [loadTreeRoot, treeRoots]);

    useEffect(() => {
        if (!autoRefreshLogs || preview?.kind !== 'log' || !selectedEntry) return;
        const interval = window.setInterval(() => {
            void loadPreview(selectedEntry, false);
        }, 3000);
        return () => window.clearInterval(interval);
    }, [autoRefreshLogs, loadPreview, preview?.kind, selectedEntry]);

    useEffect(() => {
        if (!filteredEntries.length) {
            setActiveRowPath(null);
            return;
        }
        if (!activeRowPath || !filteredEntries.some((entry) => entry.path === activeRowPath)) {
            setActiveRowPath(filteredEntries[0]?.path || null);
        }
    }, [activeRowPath, filteredEntries]);

    const handleKeyboardListNavigation = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!filteredEntries.length) return;
        const currentIndex = filteredEntries.findIndex((entry) => entry.path === activeRowPath);
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveRowPath(filteredEntries[Math.min(filteredEntries.length - 1, safeIndex + 1)]?.path || null);
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveRowPath(filteredEntries[Math.max(0, safeIndex - 1)]?.path || null);
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            const activeEntry = filteredEntries[safeIndex];
            if (!activeEntry) return;
            if (activeEntry.isDirectory) {
                navigate(activeEntry.path);
                return;
            }
            void loadPreview(activeEntry, false);
        }

        if (event.key === 'Backspace' && listing?.parentPath) {
            event.preventDefault();
            navigate(listing.parentPath);
        }

        if (event.key === ' ' && filteredEntries[safeIndex]) {
            event.preventDefault();
            const activeEntry = filteredEntries[safeIndex];
            setSelectedPaths((current) => {
                const next = new Set(current);
                if (next.has(activeEntry.path)) next.delete(activeEntry.path);
                else next.add(activeEntry.path);
                return next;
            });
        }
    };

    const treePanel = (
        <Card className={cn('flex flex-col', !showTree && 'lg:w-[72px]')}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle>{showTree ? 'Folders' : 'Tree'}</CardTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowTree((current) => !current)}
                        aria-label={showTree ? 'Collapse folder tree' : 'Expand folder tree'}
                    >
                        {showTree ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                    </Button>
                </div>
            </CardHeader>
            {showTree && (
                <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto" role="tree" aria-label="Directory tree">
                    {tree.map((node) => (
                        <TreeBranch
                            key={node.path}
                            node={node}
                            currentPath={currentPath}
                            expanded={expandedPaths}
                            loadingPaths={loadingTreePaths}
                            onToggle={(pathValue, isExpanded) => {
                                setExpandedPaths((current) => {
                                    const next = new Set(current);
                                    if (isExpanded) next.delete(pathValue);
                                    else next.add(pathValue);
                                    return next;
                                });
                                if (!isExpanded) void loadTreeChildren(pathValue);
                            }}
                            onSelect={(pathValue) => navigate(pathValue)}
                        />
                    ))}
                </CardContent>
            )}
        </Card>
    );

    return (
        <>
            <div className="flex h-full min-h-0 gap-3">
                <div className="hidden lg:flex lg:w-[280px] lg:flex-col">{treePanel}</div>

                <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.25fr),minmax(360px,0.85fr)]">
                    <Card className="min-h-0 flex flex-col">
                        <CardHeader className="gap-3 border-b border-border pb-4">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                        {breadcrumbs.map((segment, index) => (
                                            <React.Fragment key={segment.path}>
                                                <button
                                                    className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
                                                    onClick={() => navigate(segment.path)}
                                                >
                                                    {segment.label}
                                                </button>
                                                {index < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3" />}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary">{listing?.summary.directories || 0} dirs</Badge>
                                        <Badge variant="secondary">{listing?.summary.files || 0} files</Badge>
                                        <Badge variant="outline">{formatBytes(listing?.summary.totalSize || 0)}</Badge>
                                        {selectedEntries.length > 0 && (
                                            <Badge variant="warning">{selectedEntries.length} selected</Badge>
                                        )}
                                    </div>
                                    {listing?.git && (
                                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs">
                                            <GitBranch className="h-3.5 w-3.5 text-primary" />
                                            <span className="font-medium text-foreground">{listing.git.branch}</span>
                                            <Badge variant={listing.git.dirty ? 'warning' : 'success'}>
                                                {listing.git.dirty ? `${listing.git.changedFiles} changed` : 'Clean'}
                                            </Badge>
                                            <span className="truncate text-muted-foreground">{listing.git.root}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button variant="outline" size="icon" onClick={() => setShowMobileTree(true)} className="lg:hidden" aria-label="Open folder tree">
                                        <PanelLeftOpen className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="icon" onClick={() => handleHistoryMove(-1)} disabled={historyIndex <= 0} aria-label="Go back">
                                        <ArrowLeft className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="icon" onClick={() => handleHistoryMove(1)} disabled={historyIndex < 0 || historyIndex >= history.length - 1} aria-label="Go forward">
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="icon" onClick={refresh} aria-label="Refresh directory">
                                        <RefreshCcw className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} aria-label="Upload files">
                                        <Upload className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="icon" onClick={() => setDialogState({ kind: 'create', entryKind: 'file' })} aria-label="Create file">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="icon" onClick={() => setDialogState({ kind: 'create', entryKind: 'directory' })} aria-label="Create folder">
                                        <FolderPlus className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="icon" onClick={() => setShowSettings(true)} aria-label="Open settings">
                                        <Settings2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                                    <Input
                                        icon={<Search className="h-4 w-4" />}
                                        placeholder="Filter files in this directory. Supports *.log and ? wildcards."
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        className="lg:max-w-md"
                                        aria-label="Filter files"
                                    />
                                    <div className="flex flex-wrap gap-2 overflow-x-auto">
                                        {settings.shortcuts.map((shortcut) => (
                                            <button
                                                key={shortcut.id}
                                                onClick={() => navigate(shortcut.path)}
                                                className={cn(
                                                    'min-h-[36px] rounded-lg border px-3 text-xs font-medium transition-colors',
                                                    currentPath === shortcut.path
                                                        ? 'border-primary bg-primary text-primary-foreground'
                                                        : 'border-border bg-secondary/50 text-muted-foreground hover:bg-accent hover:text-foreground',
                                                )}
                                                title={shortcut.path}
                                            >
                                                {shortcut.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {selectedEntries.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-secondary/20 px-3 py-2">
                                        <span className="text-xs font-medium text-foreground">Bulk actions</span>
                                        <Button variant="outline" size="sm" onClick={() => setSelectedPaths(new Set())}>Clear</Button>
                                        <Button variant="destructive" size="sm" onClick={() => openDeleteDialog(selectedEntries)}>Delete selected</Button>
                                    </div>
                                )}
                            </div>
                        </CardHeader>

                        <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={(event) => uploadFiles(event.target.files)}
                                data-testid="file-upload-input"
                            />

                            <div
                                className={cn(
                                    'mx-5 mt-4 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors',
                                    dragging ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-secondary/10',
                                )}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    setDragging(true);
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    setDragging(false);
                                    void uploadFiles(event.dataTransfer.files);
                                }}
                                data-testid="upload-dropzone"
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="font-medium text-foreground">Drop files here to upload</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Uploads stream directly into the current directory.</p>
                                    </div>
                                    {uploadProgress > 0 ? (
                                        <Badge variant="secondary">{uploadProgress}%</Badge>
                                    ) : (
                                        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                                            <Upload className="h-3.5 w-3.5" />
                                            Choose Files
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {loading ? (
                                <div className="flex flex-1 items-center justify-center">
                                    <Spinner size="lg" />
                                </div>
                            ) : filteredEntries.length === 0 ? (
                                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                                    {search ? 'No entries match this filter.' : 'This directory is empty.'}
                                </div>
                            ) : (
                                <>
                                    <div className="hidden md:block px-5 pt-4">
                                        <div className="grid grid-cols-[40px,minmax(0,1.2fr),110px,165px,110px,188px] gap-3 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                                            <span />
                                            <span>Name</span>
                                            <span className="text-right">Size</span>
                                            <span>Modified</span>
                                            <span>Perms</span>
                                            <span>Actions</span>
                                        </div>
                                    </div>

                                    <div
                                        ref={listRef}
                                        className="min-h-0 flex-1 overflow-y-auto outline-none"
                                        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                                        onKeyDown={handleKeyboardListNavigation}
                                        tabIndex={0}
                                        aria-label="File list"
                                        data-testid="file-list"
                                    >
                                        <div
                                            className="relative"
                                            style={{ height: useVirtualization ? filteredEntries.length * rowHeight : 'auto', minHeight: !useVirtualization ? undefined : visibleHeight }}
                                        >
                                            {(useVirtualization ? visibleEntries : filteredEntries).map((entry, index) => {
                                                const actualIndex = useVirtualization ? startIndex + index : index;
                                                const Icon = fileIcon(entry);
                                                const isSelected = selectedPaths.has(entry.path);
                                                const isActive = activeRowPath === entry.path;

                                                return (
                                                    <div
                                                        key={entry.path}
                                                        className={cn(
                                                            'mx-5 grid items-center gap-3 border-b border-border/70 px-3 py-2 transition-colors md:grid-cols-[40px,minmax(0,1.2fr),110px,165px,110px,188px]',
                                                            selectedEntry?.path === entry.path ? 'bg-accent/40' : 'hover:bg-accent/20',
                                                            isActive && 'ring-1 ring-inset ring-primary/40',
                                                        )}
                                                        style={useVirtualization ? {
                                                            position: 'absolute',
                                                            insetInline: 0,
                                                            top: actualIndex * rowHeight,
                                                            height: rowHeight,
                                                        } : undefined}
                                                        onMouseEnter={() => setActiveRowPath(entry.path)}
                                                        data-testid={`entry-row-${entry.name}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent md:flex"
                                                            onClick={() => setSelectedPaths((current) => {
                                                                const next = new Set(current);
                                                                if (next.has(entry.path)) next.delete(entry.path);
                                                                else next.add(entry.path);
                                                                return next;
                                                            })}
                                                            aria-label={isSelected ? `Deselect ${entry.name}` : `Select ${entry.name}`}
                                                        >
                                                            {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                                        </button>
                                                        <button
                                                            onClick={() => entry.isDirectory ? navigate(entry.path) : void loadPreview(entry, false)}
                                                            className="flex min-w-0 items-center gap-3 text-left"
                                                        >
                                                            <Icon className={cn('h-4 w-4 shrink-0', entry.isDirectory ? 'text-primary' : 'text-muted-foreground')} />
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
                                                                <p className="truncate text-xs text-muted-foreground">{entry.path}</p>
                                                            </div>
                                                        </button>
                                                        <span className="hidden text-right text-xs text-muted-foreground md:block">
                                                            {entry.isDirectory ? 'Folder' : formatBytes(entry.size)}
                                                        </span>
                                                        <span className="hidden text-xs text-muted-foreground md:block">
                                                            {new Date(entry.modifiedAt).toLocaleString()}
                                                        </span>
                                                        <div className="hidden md:block">
                                                            <Badge variant={entry.canWrite ? 'secondary' : 'outline'}>{entry.permissions}</Badge>
                                                        </div>
                                                        <div className="flex items-center justify-end gap-1">
                                                            {!entry.isDirectory && (
                                                                <>
                                                                    <Button variant="ghost" size="icon" onClick={() => void loadPreview(entry, false)} aria-label={`Preview ${entry.name}`}>
                                                                        <Eye className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="icon" onClick={() => handleDownload(entry)} aria-label={`Download ${entry.name}`}>
                                                                        <Download className="h-4 w-4" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                            <Button variant="ghost" size="icon" onClick={() => void handleCopyPath(entry)} aria-label={`Copy path for ${entry.name}`}>
                                                                <Copy className="h-4 w-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" onClick={() => setDialogState({ kind: 'rename', entry })} disabled={!entry.canWrite} aria-label={`Rename ${entry.name}`}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" onClick={() => openDeleteDialog([entry])} disabled={!entry.canWrite} aria-label={`Delete ${entry.name}`}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="space-y-2 overflow-y-auto px-4 pb-4 pt-3 md:hidden">
                                        {filteredEntries.map((entry) => {
                                            const Icon = fileIcon(entry);
                                            const isSelected = selectedPaths.has(entry.path);

                                            return (
                                                <div key={entry.path} className="rounded-xl border border-border bg-secondary/10 p-3">
                                                    <div className="flex items-start gap-2">
                                                        <button
                                                            type="button"
                                                            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground"
                                                            onClick={() => setSelectedPaths((current) => {
                                                                const next = new Set(current);
                                                                if (next.has(entry.path)) next.delete(entry.path);
                                                                else next.add(entry.path);
                                                                return next;
                                                            })}
                                                            aria-label={isSelected ? `Deselect ${entry.name}` : `Select ${entry.name}`}
                                                        >
                                                            {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                                        </button>
                                                        <button onClick={() => entry.isDirectory ? navigate(entry.path) : void loadPreview(entry, false)} className="flex w-full items-start gap-3 text-left">
                                                            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', entry.isDirectory ? 'text-primary' : 'text-muted-foreground')} />
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
                                                                <p className="mt-1 truncate text-xs text-muted-foreground">{entry.path}</p>
                                                                <div className="mt-2 flex flex-wrap gap-2">
                                                                    <Badge variant="secondary">{entry.isDirectory ? 'Folder' : formatBytes(entry.size)}</Badge>
                                                                    <Badge variant="outline">{entry.permissions}</Badge>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {!entry.isDirectory && <Button variant="outline" size="sm" onClick={() => void loadPreview(entry, false)}>Preview</Button>}
                                                        {!entry.isDirectory && <Button variant="outline" size="sm" onClick={() => handleDownload(entry)}>Download</Button>}
                                                        <Button variant="outline" size="sm" onClick={() => void handleCopyPath(entry)}>Copy Path</Button>
                                                        <Button variant="outline" size="sm" onClick={() => setDialogState({ kind: 'rename', entry })} disabled={!entry.canWrite}>Rename</Button>
                                                        <Button variant="destructive" size="sm" onClick={() => openDeleteDialog([entry])} disabled={!entry.canWrite}>Delete</Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="min-h-0 flex flex-col">
                        <CardHeader className="border-b border-border pb-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <CardTitle>{selectedEntry ? selectedEntry.name : 'Preview'}</CardTitle>
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                        {selectedEntry ? selectedEntry.path : 'Select a file to preview or edit it.'}
                                    </p>
                                </div>
                                {selectedEntry && !selectedEntry.isDirectory && (
                                    <div className="flex items-center gap-2">
                                        {preview?.kind === 'log' && (
                                            <button
                                                className={cn(
                                                    'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                                                    autoRefreshLogs ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-secondary/50 text-muted-foreground',
                                                )}
                                                onClick={() => setAutoRefreshLogs((current) => !current)}
                                            >
                                                Auto refresh
                                            </button>
                                        )}
                                        {!isEditing && preview?.canWrite && preview?.encoding === 'utf8' && (
                                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void loadPreview(selectedEntry, true)}>
                                                <Pencil className="h-3.5 w-3.5" />
                                                Edit
                                            </Button>
                                        )}
                                        {isEditing && (
                                            <Button size="sm" className="gap-1.5" onClick={() => void handleSave()} loading={saving}>
                                                <Save className="h-3.5 w-3.5" />
                                                Save
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardHeader>

                        <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
                            {!selectedEntry ? (
                                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                    Preview, download, copy path, or edit files from here.
                                </div>
                            ) : previewLoading ? (
                                <div className="flex h-full items-center justify-center">
                                    <Spinner />
                                </div>
                            ) : !preview ? (
                                <div className="text-sm text-muted-foreground">Preview unavailable.</div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs">
                                            <p className="text-muted-foreground">Last modified</p>
                                            <p className="mt-1 font-medium text-foreground">{new Date(preview.modifiedAt).toLocaleString()}</p>
                                        </div>
                                        <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs">
                                            <p className="text-muted-foreground">Permissions</p>
                                            <p className="mt-1 font-medium text-foreground">{preview.permissions}</p>
                                        </div>
                                        <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs">
                                            <p className="text-muted-foreground">Size</p>
                                            <p className="mt-1 font-medium text-foreground">{formatBytes(preview.size)}</p>
                                        </div>
                                    </div>

                                    {renderPreviewContent({
                                        isEditing,
                                        editorValue,
                                        onEditorChange: setEditorValue,
                                        preview,
                                        onOpenLightbox: () => setLightboxOpen(true),
                                    })}

                                    {preview.truncated && (
                                        <Badge variant="warning">Preview truncated by module limit</Badge>
                                    )}

                                    {!preview.canWrite && preview.encoding === 'utf8' && (
                                        <Badge variant="outline">Read-only</Badge>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleDownload(selectedEntry)}>
                                            <Download className="h-3.5 w-3.5" />
                                            Download
                                        </Button>
                                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleCopyPath(selectedEntry)}>
                                            <Copy className="h-3.5 w-3.5" />
                                            Copy Path
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {showMobileTree && (
                <Overlay onClose={() => setShowMobileTree(false)} labelledBy="mobile-tree-title" widthClass="max-w-md">
                    <div className="border-b border-border p-5">
                        <div className="flex items-center justify-between">
                            <h3 id="mobile-tree-title" className="text-base font-semibold text-foreground">Folders</h3>
                            <Button variant="ghost" size="icon" onClick={() => setShowMobileTree(false)} aria-label="Close folder tree">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="max-h-[70vh] p-4">{treePanel}</div>
                </Overlay>
            )}

            {showSettings && (
                <FileBrowserSettingsModal
                    settings={settings}
                    onClose={() => setShowSettings(false)}
                    onSaved={(nextSettings) => {
                        setSettings(nextSettings);
                        setTreeRoots(Array.from(new Set(nextSettings.shortcuts.map((shortcut) => shortcut.path).concat('/'))));
                    }}
                />
            )}

            <FileOperationDialog
                key={
                    dialogState?.kind === 'rename' ? `rename-${dialogState.entry.path}`
                        : dialogState?.kind === 'delete' ? `delete-${dialogState.entries.map((entry) => entry.path).join('|')}`
                            : dialogState?.kind === 'create' ? `create-${dialogState.entryKind}`
                                : 'dialog-none'
                }
                state={dialogState}
                onClose={() => setDialogState(null)}
                onConfirm={handleDialogConfirm}
                busy={dialogBusy}
            />

            {lightboxOpen && preview?.kind === 'image' && preview.content && (
                <Overlay onClose={() => setLightboxOpen(false)} labelledBy="image-lightbox-title" widthClass="max-w-5xl">
                    <div className="flex items-center justify-between border-b border-border p-5">
                        <h3 id="image-lightbox-title" className="text-base font-semibold text-foreground">{preview.name}</h3>
                        <Button variant="ghost" size="icon" onClick={() => setLightboxOpen(false)} aria-label="Close image preview">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="p-5">
                        <Image
                            src={`data:${preview.mimeType || 'image/png'};base64,${preview.content}`}
                            alt={preview.name}
                            width={2200}
                            height={1800}
                            unoptimized
                            className="max-h-[80vh] w-full rounded-lg object-contain"
                        />
                    </div>
                </Overlay>
            )}
        </>
    );
}
