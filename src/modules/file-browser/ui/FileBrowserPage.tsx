'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    ChevronRight,
    FileText,
    Folder,
    FolderOpen,
    FolderPlus,
    LoaderCircle,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    RefreshCcw,
    Search,
    Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import FileBrowserSettingsModal, { FileBrowserSettings } from './FileBrowserSettingsModal';
import { FileBrowserBreadcrumbs } from './components/FileBrowserBreadcrumbs';
import { FileBrowserGitBar } from './components/FileBrowserGitBar';
import { FileBrowserEntryList, FileEntry, FileKind } from './components/FileBrowserEntryList';
import { FileBrowserPreview } from './components/FileBrowserPreview';

interface GitInfo {
    root: string;
    branch: string;
    dirty: boolean;
    changedFiles: number;
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
    kind: FileKind;
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
    isDirectory: boolean;
    children?: TreeNode[];
}

const DEFAULT_SETTINGS: FileBrowserSettings = {
    shortcuts: [
        { id: 'root', label: 'Root', path: '/' },
    ],
    defaultPath: '/',
    editorMaxBytes: 1024 * 1024,
    previewMaxBytes: 512 * 1024,
};

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

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, init);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }
    return data as T;
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

        load();
        window.addEventListener('file-browser-shortcuts-updated', handleUpdated);
        return () => window.removeEventListener('file-browser-shortcuts-updated', handleUpdated);
    }, []);

    if (pathname !== '/file-browser') {
        return null;
    }

    return (
        <div className="flex items-center gap-1.5 ml-4">
            {settings.shortcuts.slice(0, 6).map((shortcut) => (
                <button
                    key={shortcut.id}
                    onClick={() => router.push(`/file-browser?path=${encodeURIComponent(shortcut.path)}`)}
                    className="h-8 max-w-[9rem] rounded-lg border border-border bg-secondary/30 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-accent hover:text-foreground transition-colors truncate"
                    title={shortcut.path}
                >
                    {shortcut.label}
                </button>
            ))}
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
    const isFolder = node.isDirectory;

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-0.5">
                <button
                    className={cn(
                        "min-h-[28px] min-w-[28px] rounded-md text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors flex items-center justify-center",
                        !isFolder && "invisible"
                    )}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(node.path, isExpanded);
                    }}
                    disabled={!node.hasChildren && !node.children?.length}
                >
                    <ChevronRight className={cn('w-3.5 h-3.5 transition-transform duration-200', isExpanded && 'rotate-90')} />
                </button>
                <button
                    onClick={() => {
                        if (isFolder) {
                            if (!isExpanded) onToggle(node.path, false);
                            onSelect(node.path);
                        } else {
                            onSelect(node.path);
                        }
                    }}
                    className={cn(
                        'flex min-h-[32px] flex-1 items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-all duration-200',
                        isActive 
                            ? 'bg-primary/10 text-primary font-semibold shadow-sm border border-primary/20' 
                            : 'text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground border border-transparent',
                    )}
                    title={node.path}
                >
                    {isFolder ? (
                        isExpanded ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-primary/70" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                    ) : (
                        <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40" />
                    )}
                    <span className="truncate">{node.name || node.path}</span>
                    {loadingPaths.has(node.path) && <LoaderCircle className="ml-auto h-3 w-3 animate-spin text-primary" />}
                </button>
            </div>
            {isExpanded && node.children && (
                <div className="ml-3.5 border-l border-border/40 pl-2 py-0.5">
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

export default function FileBrowserPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathFromQuery = searchParams.get('path') || '';
    const initialPath = pathFromQuery || '/';

    const [settings, setSettings] = useState<FileBrowserSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [listing, setListing] = useState<DirectoryListing | null>(null);
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['/']));
    const [loadingTreePaths, setLoadingTreePaths] = useState<Set<string>>(new Set());
    const [currentPath, setCurrentPath] = useState(initialPath);
    const [search, setSearch] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
    const [preview, setPreview] = useState<PreviewFile | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [editorValue, setEditorValue] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showTree, setShowTree] = useState(true);
    const [dragging, setDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [treeRoots, setTreeRoots] = useState<string[]>(['/']);
    const historyIndexRef = useRef(-1);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const filteredEntries = useMemo(() => (
        listing?.entries.filter((entry) => matchesFilter(entry.name, search)) || []
    ), [listing?.entries, search]);


    const loadSettings = useCallback(async () => {
        try {
            const data = await fetchJson<{ settings: FileBrowserSettings }>('/api/modules/file-browser/settings');
            setSettings(data.settings);
            setTreeRoots(Array.from(new Set(data.settings.shortcuts.map((shortcut) => shortcut.path).concat('/'))));

            if (!pathFromQuery && data.settings.defaultPath) {
                setCurrentPath(data.settings.defaultPath);
            }
        } catch {
            setSettings(DEFAULT_SETTINGS);
        }
    }, [pathFromQuery]);

    const loadListing = useCallback(async (nextPath: string, recordHistory = false) => {
        setLoading(true);
        try {
            const data = await fetchJson<{ listing: DirectoryListing }>(`/api/modules/file-browser?path=${encodeURIComponent(nextPath)}`);
            setListing(data.listing);
            setCurrentPath(data.listing.path);
            if (recordHistory) {
                setHistory((current) => {
                    const trimmed = current.slice(0, historyIndexRef.current + 1);
                    return [...trimmed, data.listing.path];
                });
                setHistoryIndex((current) => {
                    const next = current + 1;
                    historyIndexRef.current = next;
                    return next;
                });
            } else {
                setHistory((current) => current.length === 0 ? [data.listing.path] : current);
                setHistoryIndex((current) => {
                    const next = current < 0 ? 0 : current;
                    historyIndexRef.current = next;
                    return next;
                });
            }
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Failed to load directory', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    const mergeTreeNode = useCallback((nodes: TreeNode[], pathToReplace: string, children: TreeNode[] | undefined): TreeNode[] => (
        nodes.map((node) => {
            if (node.path === pathToReplace) {
                return { ...node, children };
            }
            return node.children ? { ...node, children: mergeTreeNode(node.children, pathToReplace, children) } : node;
        })
    ), []);

    const findTreeNode = useCallback((nodes: TreeNode[], path: string): TreeNode | undefined => {
        for (const node of nodes) {
            if (node.path === path) return node;
            if (node.children) {
                const found = findTreeNode(node.children, path);
                if (found) return found;
            }
        }
        return undefined;
    }, []);

    const loadTreeRoot = useCallback(async (rootPath: string) => {
        // Prevent double loading or clearing tree on navigation
        if (tree.some(node => node.path === rootPath)) return;
        
        try {
            const data = await fetchJson<{ tree: TreeNode }>(`/api/modules/file-browser?mode=tree&depth=1&path=${encodeURIComponent(rootPath)}`);
            setTree((current) => {
                const filtered = current.filter((node) => node.path !== rootPath);
                return [...filtered, data.tree].sort((left, right) => left.path.localeCompare(right.path));
            });
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Failed to load tree', variant: 'destructive' });
        }
    }, [toast, tree]);

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

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        void loadListing(pathFromQuery || settings.defaultPath || '/');
    }, [loadListing, pathFromQuery, settings.defaultPath]);

    useEffect(() => {
        treeRoots.forEach((rootPath) => {
            void loadTreeRoot(rootPath);
        });
    }, [loadTreeRoot, treeRoots]);

    useEffect(() => {
        if (!autoRefreshLogs || preview?.kind !== 'log' || !selectedEntry) return;
        const interval = window.setInterval(() => {
            void loadPreview(selectedEntry);
        }, 3000);
        return () => window.clearInterval(interval);
    }, [autoRefreshLogs, loadPreview, preview?.kind, selectedEntry]);

    const navigate = (nextPath: string, recordHistory = true) => {
        router.replace(`/file-browser?path=${encodeURIComponent(nextPath)}`);
        if (!recordHistory) {
            void loadListing(nextPath, false);
            return;
        }

        setHistory((current) => {
            const trimmed = current.slice(0, historyIndexRef.current + 1);
            return [...trimmed, nextPath];
        });
        setHistoryIndex((current) => {
            const next = current + 1;
            historyIndexRef.current = next;
            return next;
        });
    };

    const refresh = () => {
        void loadListing(currentPath);
        if (selectedEntry && selectedEntry.parentPath === currentPath) {
            void loadPreview(selectedEntry, isEditing);
        }
    };

    const handleCreate = async (kind: 'file' | 'directory') => {
        const label = kind === 'file' ? 'file' : 'folder';
        const name = window.prompt(`New ${label} name`);
        if (!name) return;

        try {
            await fetchJson('/api/modules/file-browser', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parentPath: currentPath,
                    name,
                    kind,
                    content: kind === 'file' ? '' : undefined,
                }),
            });
            toast({ title: `${kind === 'file' ? 'File' : 'Folder'} created`, variant: 'success' });
            refresh();
            if (kind === 'directory') {
                void loadTreeRoot(currentPath);
            }
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : `Failed to create ${label}`, variant: 'destructive' });
        }
    };

    const handleRename = async (entry: FileEntry) => {
        const nextName = window.prompt('Rename entry', entry.name);
        if (!nextName || nextName === entry.name) return;

        try {
            const data = await fetchJson<{ path: string }>('/api/modules/file-browser', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: entry.path, name: nextName }),
            });
            toast({ title: 'Entry renamed', variant: 'success' });
            refresh();
            if (selectedEntry?.path === entry.path) {
                setSelectedEntry({ ...entry, path: data.path, name: nextName });
            }
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Rename failed', variant: 'destructive' });
        }
    };

    const handleDelete = async (entry: FileEntry) => {
        const confirmed = window.confirm(`Delete ${entry.name}? This cannot be undone.`);
        if (!confirmed) return;

        try {
            await fetchJson('/api/modules/file-browser', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: entry.path }),
            });
            toast({ title: 'Entry deleted', variant: 'success' });
            if (selectedEntry?.path === entry.path) {
                setSelectedEntry(null);
                setPreview(null);
                setIsEditing(false);
            }
            refresh();
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Delete failed', variant: 'destructive' });
        }
    };

    const handleCopyPath = async (entry: FileEntry) => {
        try {
            await navigator.clipboard.writeText(entry.path);
            toast({ title: 'Path copied', variant: 'success' });
        } catch {
            toast({ title: 'Clipboard unavailable', variant: 'warning' });
        }
    };

    const handleDownload = (entry: FileEntry) => {
        window.open(`/api/modules/file-browser/file?path=${encodeURIComponent(entry.path)}&action=download`, '_blank');
    };

    const handleSave = async () => {
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
            refresh();
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Save failed', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const uploadFiles = async (files: FileList | null) => {
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
    };

    const handleHistoryMove = (direction: -1 | 1) => {
        const nextIndex = historyIndex + direction;
        if (nextIndex < 0 || nextIndex >= history.length) return;
        historyIndexRef.current = nextIndex;
        setHistoryIndex(nextIndex);
        navigate(history[nextIndex], false);
    };


    return (
        <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-500">
            {/* Header / Toolbar */}
            <div className="flex flex-col border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-muted-foreground hover:bg-accent"
                                onClick={() => handleHistoryMove(-1)}
                                disabled={historyIndex <= 0}
                            >
                                <ChevronRight className="w-5 h-5 rotate-180" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-muted-foreground hover:bg-accent"
                                onClick={() => handleHistoryMove(1)}
                                disabled={historyIndex >= history.length - 1}
                            >
                                <ChevronRight className="w-5 h-5" />
                            </Button>
                        </div>
                        <div className="h-6 w-px bg-border/50 mx-1" />
                        <FileBrowserBreadcrumbs 
                            segments={buildSegments(currentPath)} 
                            onNavigate={(path) => navigate(path)} 
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative w-64 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
                            <Input
                                placeholder="Filter files..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-9 pl-9 bg-secondary/20 border-border/40 focus:bg-background transition-all"
                            />
                        </div>
                        <Button variant="outline" size="sm" onClick={refresh} className="h-9 w-9 p-0">
                            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="h-9 w-9 p-0">
                            <Settings2 className="h-4 w-4" />
                        </Button>
                        <div className="h-6 w-px bg-border/50 mx-1" />
                        <Button 
                            className="h-9 gap-2 shadow-sm shadow-primary/20"
                            onClick={() => handleCreate('file')}
                        >
                            <Plus className="h-4 w-4" />
                            New File
                        </Button>
                    </div>
                </div>

                {listing?.git && (
                    <div className="px-6 pb-4">
                        <FileBrowserGitBar git={listing.git} />
                    </div>
                )}
            </div>

            <div className="flex flex-1 min-h-0 divide-x divide-border/50 overflow-hidden">
                {/* Sidebar Tree */}
                {showTree && (
                    <div className="w-72 flex flex-col bg-secondary/5 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Directory Tree</h3>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-muted-foreground"
                                onClick={() => handleCreate('directory')}
                            >
                                <FolderPlus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                            {tree.map((node) => (
                                <TreeBranch
                                    key={node.path}
                                    node={node}
                                    currentPath={currentPath}
                                    expanded={expandedPaths}
                                    loadingPaths={loadingTreePaths}
                                    onToggle={async (path, isExpanded) => {
                                        if (isExpanded) {
                                            setExpandedPaths((prev) => {
                                                const next = new Set(prev);
                                                next.delete(path);
                                                return next;
                                            });
                                        } else {
                                            setExpandedPaths((prev) => new Set([...prev, path]));
                                            const node = findTreeNode(tree, path);
                                            if (node && !node.children) {
                                                await loadTreeChildren(path);
                                            }
                                        }
                                    }}
                                    onSelect={(path) => {
                                        const node = findTreeNode(tree, path);
                                        if (node?.isDirectory) {
                                            navigate(path);
                                        } else {
                                            // Handle file selection
                                            const fileEntry = listing?.entries.find(e => e.path === path);
                                            if (fileEntry) {
                                                loadPreview(fileEntry);
                                            } else {
                                                // If file not in current listing, we need to fetch its parent and then preview
                                                const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
                                                navigate(parentPath);
                                                // In a real app we'd wait for navigate to finish then preview, 
                                                // but for now let's assume it's in the current listing or the user can click it there.
                                            }
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
                    <div className="flex-1 flex flex-col min-h-0">
                        {/* Drop Zone Area could go here */}
                        <div 
                            className={cn(
                                "flex-1 flex flex-col min-h-0",
                                dragging && "bg-primary/5 border-2 border-dashed border-primary m-4 rounded-2xl animate-pulse"
                            )}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragging(false);
                                void uploadFiles(e.dataTransfer.files);
                            }}
                        >
                            <FileBrowserEntryList
                                entries={filteredEntries}
                                onNavigate={navigate}
                                onPreview={loadPreview}
                                onEdit={(entry) => loadPreview(entry, true)}
                                onRename={handleRename}
                                onDelete={handleDelete}
                                onDownload={handleDownload}
                                onCopyPath={handleCopyPath}
                            />
                        </div>
                    </div>

                    {uploadProgress > 0 && (
                        <div className="absolute inset-x-0 bottom-0 p-4 bg-background/80 backdrop-blur border-t border-border">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uploading files...</span>
                                <span className="text-xs font-mono font-bold text-primary">{uploadProgress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Preview Panel */}
                <div className={cn(
                    "flex flex-col bg-background/50 backdrop-blur-md border-l border-border/40 transition-all duration-300 overflow-hidden shadow-2xl z-10",
                    selectedEntry ? "w-[35%] opacity-100" : "w-0 opacity-0 border-l-0 shadow-none"
                )}>
                    <FileBrowserPreview
                        entry={selectedEntry}
                        preview={preview}
                        loading={previewLoading}
                        isEditing={isEditing}
                        editorValue={editorValue}
                        saving={saving}
                        onEditorChange={setEditorValue}
                        onSave={handleSave}
                        onClose={() => setSelectedEntry(null)}
                        onEdit={() => selectedEntry && loadPreview(selectedEntry, true)}
                        onDownload={() => selectedEntry && handleDownload(selectedEntry)}
                        autoRefreshLogs={autoRefreshLogs}
                        onToggleAutoRefreshLogs={setAutoRefreshLogs}
                    />
                </div>
            </div>

            <Button
                variant="outline"
                size="icon"
                className="fixed bottom-6 left-6 h-10 w-10 rounded-full shadow-lg border-primary/20 bg-background/80 backdrop-blur z-20"
                onClick={() => setShowTree(!showTree)}
            >
                {showTree ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>

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
            
            <input
                type="file"
                multiple
                className="hidden"
                ref={fileInputRef}
                onChange={(e) => uploadFiles(e.target.files)}
            />
        </div>
    );
}
