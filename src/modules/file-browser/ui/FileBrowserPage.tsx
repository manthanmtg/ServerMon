'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Heart,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import FileBrowserSettingsModal, {
  FileBrowserSettings,
  FileBrowserShortcut,
} from './FileBrowserSettingsModal';
import { FileBrowserBreadcrumbs } from './components/FileBrowserBreadcrumbs';
import { FileBrowserGitBar } from './components/FileBrowserGitBar';
import { FileBrowserEntryList, FileEntry, FileKind } from './components/FileBrowserEntryList';
import { FileBrowserPreview } from './components/FileBrowserPreview';
import dynamic from 'next/dynamic';

const CodeEditorModal = dynamic(() => import('./components/CodeEditorModal'), { ssr: false });

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

interface GitInfo {
  root: string;
  branch: string;
  dirty: boolean;
  changedFiles: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
  branches: string[];
  remotes: string[];
  ahead: number;
  behind: number;
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
  shortcuts: [{ id: 'root', label: 'Root', path: '/' }],
  defaultPath: '/',
  editorMaxBytes: 1024 * 1024,
  previewMaxBytes: 512 * 1024,
};

function formatBytesCompact(bytes: number) {
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

// ---- Resizable panel handle ----

function ResizeHandle({
  onResize,
  side,
}: {
  onResize: (delta: number) => void;
  side: 'left' | 'right';
}) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    let lastX = e.clientX;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = side === 'left' ? ev.clientX - lastX : lastX - ev.clientX;
      lastX = ev.clientX;
      onResize(delta);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      className="hidden md:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors group z-10"
      onMouseDown={handleMouseDown}
    >
      <div className="w-0.5 h-8 rounded-full bg-border group-hover:bg-primary/40 group-active:bg-primary/60 transition-colors" />
    </div>
  );
}

// ---- In-app modals to replace native prompt/confirm ----

interface InputModalProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

function InputModal({
  title,
  description,
  icon,
  placeholder,
  defaultValue,
  submitLabel,
  onSubmit,
  onClose,
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl mx-4 animate-in fade-in zoom-in-95 duration-200">
        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              {icon && (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 shrink-0">
                  {icon}
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                )}
              </div>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={!value.trim()}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  confirmLabel: string;
  variant?: 'destructive' | 'default';
  onConfirm: () => void;
  onClose: () => void;
}

function ConfirmModal({
  title,
  description,
  icon,
  confirmLabel,
  variant = 'default',
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 shrink-0">
                {icon}
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className={
              variant === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : ''
            }
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
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
        const data = await fetchJson<{ settings: FileBrowserSettings }>(
          '/api/modules/file-browser/settings'
        );
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
            'min-h-[28px] min-w-[28px] rounded-md text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors flex items-center justify-center',
            !isFolder && 'invisible'
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.path, isExpanded);
          }}
          disabled={!node.hasChildren && !node.children?.length}
        >
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 transition-transform duration-200',
              isExpanded && 'rotate-90'
            )}
          />
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
              : 'text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground border border-transparent'
          )}
          title={node.path}
        >
          {isFolder ? (
            isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 shrink-0 text-primary/70" />
            ) : (
              <Folder className="w-3.5 h-3.5 shrink-0 text-primary/70" />
            )
          ) : (
            <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40" />
          )}
          <span className="truncate">{node.name || node.path}</span>
          {loadingPaths.has(node.path) && (
            <LoaderCircle className="ml-auto h-3 w-3 animate-spin text-primary" />
          )}
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
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const [treeWidth, setTreeWidth] = useState(288);
  const [previewWidth, setPreviewWidth] = useState(420);
  const treeWidthRef = useRef(288);
  const previewWidthRef = useRef(420);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [treeRoots, setTreeRoots] = useState<string[]>(['/']);
  const [dialogState, setDialogState] = useState<
    | { type: 'create'; kind: 'file' | 'directory' }
    | { type: 'rename'; entry: FileEntry }
    | { type: 'delete'; entry: FileEntry }
    | { type: 'favorite'; entry: FileEntry }
    | null
  >(null);
  const historyIndexRef = useRef(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const filteredEntries = useMemo(
    () => listing?.entries.filter((entry) => matchesFilter(entry.name, search)) || [],
    [listing?.entries, search]
  );

  const favoritePaths = useMemo(
    () => new Set(settings.shortcuts.map((s) => s.path)),
    [settings.shortcuts]
  );

  const loadSettings = useCallback(async () => {
    try {
      const data = await fetchJson<{ settings: FileBrowserSettings }>(
        '/api/modules/file-browser/settings'
      );
      setSettings(data.settings);
      setTreeRoots(
        Array.from(new Set(data.settings.shortcuts.map((shortcut) => shortcut.path).concat('/')))
      );

      if (!pathFromQuery && data.settings.defaultPath) {
        setCurrentPath(data.settings.defaultPath);
      }
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, [pathFromQuery]);

  const loadListing = useCallback(
    async (nextPath: string, recordHistory = false) => {
      setLoading(true);
      try {
        const data = await fetchJson<{ listing: DirectoryListing }>(
          `/api/modules/file-browser?path=${encodeURIComponent(nextPath)}`
        );
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
          setHistory((current) => (current.length === 0 ? [data.listing.path] : current));
          setHistoryIndex((current) => {
            const next = current < 0 ? 0 : current;
            historyIndexRef.current = next;
            return next;
          });
        }
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : 'Failed to load directory',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const mergeTreeNode = useCallback(
    (nodes: TreeNode[], pathToReplace: string, children: TreeNode[] | undefined): TreeNode[] =>
      nodes.map((node) => {
        if (node.path === pathToReplace) {
          return { ...node, children };
        }
        return node.children
          ? { ...node, children: mergeTreeNode(node.children, pathToReplace, children) }
          : node;
      }),
    []
  );

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

  const loadTreeRoot = useCallback(
    async (rootPath: string) => {
      // Prevent double loading or clearing tree on navigation
      if (tree.some((node) => node.path === rootPath)) return;

      try {
        const data = await fetchJson<{ tree: TreeNode }>(
          `/api/modules/file-browser?mode=tree&depth=1&path=${encodeURIComponent(rootPath)}`
        );
        setTree((current) => {
          const filtered = current.filter((node) => node.path !== rootPath);
          return [...filtered, data.tree].sort((left, right) =>
            left.path.localeCompare(right.path)
          );
        });
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : 'Failed to load tree',
          variant: 'destructive',
        });
      }
    },
    [toast, tree]
  );

  const loadTreeChildren = useCallback(
    async (nodePath: string) => {
      setLoadingTreePaths((current) => new Set([...current, nodePath]));
      try {
        const data = await fetchJson<{ tree: TreeNode }>(
          `/api/modules/file-browser?mode=tree&depth=1&path=${encodeURIComponent(nodePath)}`
        );
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
    },
    [mergeTreeNode, toast]
  );

  const loadPreview = useCallback(
    async (entry: FileEntry, editMode = false) => {
      setSelectedEntry(entry);
      setPreviewLoading(true);
      setIsEditing(false);
      if (editMode) setShowCodeEditor(true);
      try {
        const action = editMode ? 'edit' : 'preview';
        const data = await fetchJson<{ file: PreviewFile }>(
          `/api/modules/file-browser/file?path=${encodeURIComponent(entry.path)}&action=${action}`
        );
        setPreview(data.file);
        if (editMode) {
          setEditorValue(data.file.content || '');
          setIsEditing(true);
        }
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : 'Failed to load preview',
          variant: 'destructive',
        });
        if (editMode) setShowCodeEditor(false);
      } finally {
        setPreviewLoading(false);
      }
    },
    [toast]
  );

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

  const handleCreate = async (kind: 'file' | 'directory', name: string) => {
    const label = kind === 'file' ? 'file' : 'folder';
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
      toast({
        title: error instanceof Error ? error.message : `Failed to create ${label}`,
        variant: 'destructive',
      });
    }
  };

  const handleRename = async (entry: FileEntry, nextName: string) => {
    if (nextName === entry.name) return;
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
      toast({
        title: error instanceof Error ? error.message : 'Rename failed',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (entry: FileEntry) => {
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
      toast({
        title: error instanceof Error ? error.message : 'Delete failed',
        variant: 'destructive',
      });
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
    window.open(
      `/api/modules/file-browser/file?path=${encodeURIComponent(entry.path)}&action=download`,
      '_blank'
    );
  };

  const handleFavorite = (entry: FileEntry) => {
    if (favoritePaths.has(entry.path)) {
      const next = settings.shortcuts.filter((s) => s.path !== entry.path);
      void saveShortcuts(next);
    } else {
      setDialogState({ type: 'favorite', entry });
    }
  };

  const saveShortcuts = async (shortcuts: FileBrowserShortcut[]) => {
    try {
      const data = await fetchJson<{ settings: FileBrowserSettings }>(
        '/api/modules/file-browser/settings',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shortcuts }),
        }
      );
      setSettings(data.settings);
      setTreeRoots(Array.from(new Set(data.settings.shortcuts.map((s) => s.path).concat('/'))));
      window.dispatchEvent(
        new CustomEvent('file-browser-shortcuts-updated', { detail: data.settings })
      );
      toast({ title: 'Shortcuts updated', variant: 'success' });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : 'Failed to update shortcuts',
        variant: 'destructive',
      });
    }
  };

  const handleSave = async (content?: string) => {
    if (!selectedEntry) return;
    const saveContent = content ?? editorValue;
    setSaving(true);
    try {
      await fetchJson('/api/modules/file-browser/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedEntry.path, content: saveContent }),
      });
      toast({ title: 'File saved', variant: 'success' });
      setIsEditing(false);
      setShowCodeEditor(false);
      refresh();
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : 'Save failed',
        variant: 'destructive',
      });
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
    request.timeout = 60_000;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        toast({
          title: `${files.length} file${files.length === 1 ? '' : 's'} uploaded`,
          variant: 'success',
        });
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

    request.ontimeout = () => {
      toast({
        title: 'Upload timed out after 60s',
        variant: 'destructive',
      });
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
    <div className="relative flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-500">
      {/* Header / Toolbar */}
      <div className="flex flex-col border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Row 1: Nav + actions */}
        <div className="flex items-center gap-2 px-3 py-3 md:px-6 md:py-4 flex-wrap">
          <div className="flex items-center gap-1 md:gap-2 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:h-9 md:w-9 text-muted-foreground hover:bg-accent shrink-0 md:hidden"
              onClick={() => setShowTree(!showTree)}
            >
              {showTree ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </Button>
            <div className="hidden md:flex items-center gap-2">
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
              <div className="h-6 w-px bg-border/50 mx-1" />
            </div>
            <FileBrowserBreadcrumbs
              segments={buildSegments(currentPath)}
              onNavigate={(path) => navigate(path)}
            />
          </div>

          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              className="h-8 w-8 md:h-9 md:w-9 p-0"
            >
              <RefreshCcw className={cn('h-3.5 w-3.5 md:h-4 md:w-4', loading && 'animate-spin')} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(true)}
              className="h-8 w-8 md:h-9 md:w-9 p-0"
            >
              <Settings2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </Button>
            <div className="hidden md:block h-6 w-px bg-border/50 mx-1" />
            <Button
              variant="outline"
              size="sm"
              className="h-8 md:h-9 gap-2 hidden md:inline-flex"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden lg:inline">Upload</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 md:h-9 gap-2 hidden md:inline-flex"
              onClick={() => setDialogState({ type: 'create', kind: 'directory' })}
            >
              <FolderPlus className="h-4 w-4" />
              <span className="hidden lg:inline">New Folder</span>
            </Button>
            <Button
              className="h-8 md:h-9 gap-2 shadow-sm shadow-primary/20"
              onClick={() => setDialogState({ type: 'create', kind: 'file' })}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New File</span>
            </Button>
          </div>
        </div>

        {/* Row 2: Search (full width on mobile) */}
        <div className="px-3 pb-3 md:px-6 md:pb-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Filter files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 bg-secondary/20 border-border/40 focus:bg-background transition-all w-full md:max-w-xs"
            />
          </div>
        </div>

        {listing?.git && (
          <div className="px-3 pb-3 md:px-6 md:pb-4">
            <FileBrowserGitBar git={listing.git} onRefresh={refresh} />
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Sidebar Tree — overlay on mobile, inline on desktop */}
        {showTree && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/40 md:hidden"
              onClick={() => setShowTree(false)}
            />
            <div
              className={cn(
                'flex flex-col bg-background md:bg-secondary/5 overflow-hidden border-r border-border/50 z-30 shrink-0',
                'fixed inset-y-0 left-0 w-[280px] shadow-2xl md:shadow-none',
                'md:relative md:inset-auto md:w-auto'
              )}
              style={{ width: treeWidth }}
            >
              <div className="flex items-center justify-between px-4 py-3 md:px-5 md:py-4 border-b border-border/40">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Directory Tree
                </h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={() => setDialogState({ type: 'create', kind: 'directory' })}
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground md:hidden"
                    onClick={() => setShowTree(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
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
                        const fileEntry = listing?.entries.find((e) => e.path === path);
                        if (fileEntry) {
                          loadPreview(fileEntry);
                        } else {
                          const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
                          navigate(parentPath);
                        }
                      }
                      // Auto-close sidebar on mobile after selection
                      if (window.innerWidth < 768) setShowTree(false);
                    }}
                  />
                ))}
              </div>
              <div className="hidden md:flex items-center justify-center py-2 border-t border-border/40 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full mx-2 gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  onClick={() => setShowTree(false)}
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                  Collapse
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Expand sidebar button when tree is hidden (desktop) */}
        {!showTree && (
          <div className="hidden md:flex items-start shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 m-1 text-muted-foreground hover:text-foreground"
              onClick={() => setShowTree(true)}
              title="Show directory tree"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Resize handle: tree ↔ content */}
        {showTree && (
          <ResizeHandle
            side="left"
            onResize={(delta) => {
              const next = Math.max(180, Math.min(500, treeWidthRef.current + delta));
              treeWidthRef.current = next;
              setTreeWidth(next);
            }}
          />
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
          <div className="flex-1 flex flex-col min-h-0">
            <div
              className={cn(
                'flex-1 flex flex-col min-h-0',
                dragging &&
                  'bg-primary/5 border-2 border-dashed border-primary m-4 rounded-2xl animate-pulse'
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void uploadFiles(e.dataTransfer.files);
              }}
            >
              <FileBrowserEntryList
                entries={filteredEntries}
                selectedPath={selectedEntry?.path}
                favoritePaths={favoritePaths}
                onNavigate={navigate}
                onPreview={loadPreview}
                onEdit={(entry) => loadPreview(entry, true)}
                onRename={(entry) => setDialogState({ type: 'rename', entry })}
                onDelete={(entry) => setDialogState({ type: 'delete', entry })}
                onDownload={handleDownload}
                onCopyPath={handleCopyPath}
                onFavorite={handleFavorite}
              />
            </div>
          </div>

          {/* Summary bar */}
          {listing?.summary && !loading && (
            <div className="flex items-center gap-3 px-3 py-2 md:px-6 md:py-2.5 border-t border-border/40 bg-secondary/5 text-[10px] md:text-[11px] font-medium text-muted-foreground shrink-0">
              <span>
                {listing.summary.directories} folder{listing.summary.directories !== 1 ? 's' : ''}
              </span>
              <span className="opacity-30">·</span>
              <span>
                {listing.summary.files} file{listing.summary.files !== 1 ? 's' : ''}
              </span>
              {listing.summary.totalSize > 0 && (
                <>
                  <span className="opacity-30">·</span>
                  <span>{formatBytesCompact(listing.summary.totalSize)}</span>
                </>
              )}
            </div>
          )}

          {uploadProgress > 0 && (
            <div className="absolute inset-x-0 bottom-0 p-4 bg-background/80 backdrop-blur border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Uploading files...
                </span>
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

        {/* Preview Panel — full-screen overlay on mobile, inline on desktop */}
        {selectedEntry && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setSelectedEntry(null)}
            />

            {/* Resize handle: content ↔ preview */}
            <ResizeHandle
              side="right"
              onResize={(delta) => {
                const next = Math.max(350, Math.min(800, previewWidthRef.current + delta));
                previewWidthRef.current = next;
                setPreviewWidth(next);
              }}
            />

            <div
              className={cn(
                'flex flex-col bg-background backdrop-blur-md overflow-hidden shadow-2xl z-40 shrink-0',
                'fixed inset-2 rounded-2xl md:rounded-none md:shadow-none',
                'md:relative md:inset-auto md:border-l md:border-border/40 md:w-auto'
              )}
              style={{ width: previewWidth }}
            >
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
          </>
        )}
      </div>

      {/* Mobile bottom action bar */}
      <div className="flex md:hidden items-center justify-around border-t border-border/50 bg-background/95 backdrop-blur px-2 py-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={() => setDialogState({ type: 'create', kind: 'directory' })}
        >
          <FolderPlus className="h-3.5 w-3.5" /> Folder
        </Button>
        <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs" onClick={refresh}>
          <RefreshCcw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {showSettings && (
        <FileBrowserSettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(nextSettings) => {
            setSettings(nextSettings);
            setTreeRoots(
              Array.from(
                new Set(nextSettings.shortcuts.map((shortcut) => shortcut.path).concat('/'))
              )
            );
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

      {/* In-app modals for create / rename / delete */}
      {dialogState?.type === 'create' && (
        <InputModal
          title={dialogState.kind === 'file' ? 'New File' : 'New Folder'}
          description={`Create a new ${dialogState.kind === 'file' ? 'file' : 'folder'} in the current directory.`}
          icon={
            dialogState.kind === 'file' ? (
              <Plus className="h-5 w-5 text-primary" />
            ) : (
              <FolderPlus className="h-5 w-5 text-primary" />
            )
          }
          placeholder={dialogState.kind === 'file' ? 'filename.txt' : 'folder-name'}
          submitLabel="Create"
          onSubmit={(name) => {
            const kind = dialogState.kind;
            setDialogState(null);
            void handleCreate(kind, name);
          }}
          onClose={() => setDialogState(null)}
        />
      )}

      {dialogState?.type === 'rename' && (
        <InputModal
          title="Rename"
          description={`Rename "${dialogState.entry.name}"`}
          icon={<Pencil className="h-5 w-5 text-primary" />}
          defaultValue={dialogState.entry.name}
          placeholder="New name"
          submitLabel="Rename"
          onSubmit={(name) => {
            const entry = dialogState.entry;
            setDialogState(null);
            void handleRename(entry, name);
          }}
          onClose={() => setDialogState(null)}
        />
      )}

      {dialogState?.type === 'delete' && (
        <ConfirmModal
          title="Delete entry"
          description={`Are you sure you want to delete "${dialogState.entry.name}"? This cannot be undone.`}
          icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => {
            const entry = dialogState.entry;
            setDialogState(null);
            void handleDelete(entry);
          }}
          onClose={() => setDialogState(null)}
        />
      )}

      {dialogState?.type === 'favorite' && (
        <InputModal
          title="Add to Shortcuts"
          description={`Add "${dialogState.entry.name}" (${dialogState.entry.path}) as a topbar shortcut.`}
          icon={<Heart className="h-5 w-5 text-red-500" />}
          placeholder="Shortcut label"
          defaultValue={dialogState.entry.name}
          submitLabel="Add Shortcut"
          onSubmit={(label) => {
            const entry = dialogState.entry;
            setDialogState(null);
            const id =
              label
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '') || `shortcut-${Date.now()}`;
            const next = [...settings.shortcuts, { id, label, path: entry.path }];
            void saveShortcuts(next);
          }}
          onClose={() => setDialogState(null)}
        />
      )}

      {showCodeEditor && selectedEntry && (
        <CodeEditorModal
          fileName={selectedEntry.name}
          extension={selectedEntry.extension}
          content={editorValue}
          loading={previewLoading}
          saving={saving}
          onSave={(content) => void handleSave(content)}
          onClose={() => {
            setShowCodeEditor(false);
            setIsEditing(false);
          }}
        />
      )}
    </div>
  );
}
